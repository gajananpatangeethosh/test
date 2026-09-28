"use client";
import { useEffect, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button, Modal, Badge } from "./ui";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import { useWallet } from "./mst/wallet-provider";
import { createCreatorCoin, createPostCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { cn, fmtMst } from "@/lib/utils";
import { createPostAction } from "@/app/actions/posts";
import { getMyCoinAction, recordCoinMintAction } from "@/app/actions/coins";
import { recordPostCoinMintAction } from "@/app/actions/post-coins";
import { mintLabel } from "@/lib/markets";
import type { LiveCoin } from "@/lib/db/types";
import type { TxStage } from "@/lib/mst/types";

type PublishStep = "uploading" | "metadata" | "chain" | "done";

export function CreateModal({ onClose, onPublished }: { onClose: () => void; onPublished?: (postId: string) => void }) {
  const { isConnected, connect, isCorrectNetwork, addTx, address, chainId } = useWallet();
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"post" | "creator-coin">("post");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [local, setLocal] = useState<PublishStep | null>(null);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [myCoin, setMyCoin] = useState<LiveCoin | null>(null);
  const busy = local === "uploading" || local === "metadata" || local === "chain" || (stage !== "idle" && stage !== "confirmed" && stage !== "failed");

  useEffect(() => {
    if (kind !== "creator-coin") return;
    let active = true;
    void getMyCoinAction()
      .then((r) => { if (active) setMyCoin(r.ok ? r.coin : null); })
      .catch(() => { if (active) setMyCoin(null); });
    return () => { active = false; };
  }, [kind]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    try {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    } catch { /* ignore */ }
    setPreview(URL.createObjectURL(f));
  };

  const publish = async () => {
    setError(null); setHash("");
    if (kind === "post") {
      if (!caption.trim()) { setError("Write a caption first."); return; }
      setLocal("uploading");
      try {
        let imageUrl: string | undefined;
        let mediaKind: "photo" | "video" = "text" as never;
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          const up = (await (await fetch("/api/uploads/post-media", { method: "POST", body: fd })).json()) as {
            url?: string; kind?: "photo" | "video"; error?: string;
          };
          if (!up.url) throw new Error(up.error || "UPLOAD_FAILED");
          imageUrl = up.url;
          mediaKind = up.kind ?? (file.type.startsWith("video/") ? "video" : "photo");
        }
        setLocal("metadata");
        const r = await createPostAction({ caption: caption.trim(), kind: file ? mediaKind : "text", imageUrl });
        if (!r.ok) throw new Error(r.error);
        const postCoin = r.post.postCoin;
        if (!postCoin) throw new Error("POST_COIN_NOT_CREATED — run supabase/migrations/0004_fix_post_coin_fk.sql in Supabase, then retry.");

        setLocal("chain"); setStage("preparing");
        await recordPostCoinMintAction({ coinId: postCoin.id, status: "minting" });
        try {
          const { hash: txHash, coin: tokenAddress } = await createPostCoin({
            postId: r.post.id,
            name: postCoin.name,
            symbol: postCoin.symbol,
            owner: address!,
            seedMst: "1",
            onStage: setStage,
          });
          addTx({ hash: txHash, from: address, label: `Mint ${postCoin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
          await recordPostCoinMintAction({
            coinId: postCoin.id,
            status: "minted",
            txHash,
            tokenAddress,
          });
          setHash(txHash); setStage("confirmed"); setLocal("done");
          onPublished?.(r.post.id);
        } catch (e) {
          const message = toMstError(e).message;
          setError(message); setStage("failed");
          void recordPostCoinMintAction({ coinId: postCoin.id, status: "failed", error: message });
        }
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "CREATE_POST_FAILED");
        setLocal(null);
        return;
      }
    }

    if (kind === "creator-coin") {
      if (!myCoin) { setError("Sign in and create your live profile first."); return; }
      if (myCoin.mintStatus === "minted") { setError(`${myCoin.symbol} is already minted on MST.`); return; }
      setLocal("chain"); setStage("preparing");
      await recordCoinMintAction({ coinId: myCoin.id, status: "minting" });
      try {
        const { hash, coin: tokenAddress } = await createCreatorCoin({
          name: myCoin.name,
          symbol: myCoin.symbol,
          owner: address,
          seedMst: "10",
          onStage: setStage,
        });
        addTx({ hash, from: address, label: `Mint ${myCoin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
        await recordCoinMintAction({
          coinId: myCoin.id,
          status: "minted",
          txHash: hash,
          tokenAddress,
        });
        setHash(hash); setStage("confirmed"); setLocal("done");
      } catch (e) {
        const message = toMstError(e).message;
        setError(message); setStage("failed");
        void recordCoinMintAction({ coinId: myCoin.id, status: "failed", error: message });
      }
    }
  };

  const closeTx = () => {
    setStage("idle");
    if (stage === "confirmed" && local === "done") onClose();
  };

  return <>
    <Modal open onClose={onClose} wide>
      <div className="font-semibold text-lg">Create on MST Testnet</div>
      <p className="muted text-sm mt-1">Every post becomes an NFT token you own. Others can buy it — more buyers raise the price.</p>
      <label className={cn("mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 py-8 cursor-pointer hover:border-teal-300/40 transition")}>
        {preview ? <>
          {file?.type.startsWith("video/")
            ? <video src={preview} className="max-h-48 rounded-lg" controls />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={preview} alt="Upload preview" className="max-h-48 rounded-lg object-cover" />}
          <span className="text-sm muted mt-2">{file?.name}</span>
          <span className="text-xs text-[#5b616b]">Tap to replace · uploads to Supabase on publish</span>
        </> : <><ImagePlus className="muted" /><span className="text-sm muted mt-2">Upload media</span>
          <span className="text-xs text-[#5b616b]">PNG, JPG, WEBP, AVIF, MP4 — optional for text posts</span></>}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4" className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])} />
      </label>
      <label className="block text-sm muted mt-4">Caption</label>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} placeholder="What did you make today?"
        className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#5b616b]" />
      <div className="text-sm muted mt-4 mb-2">Create as</div>
      <div className="grid grid-cols-2 gap-2">
        {(["post", "creator-coin"] as const).map((k) => <button key={k} onClick={() => setKind(k)}
          className={cn("rounded-xl border px-3 py-3 text-sm capitalize transition", kind === k ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:border-white/25")}>
          {k === "post" ? "Post NFT" : "My Creator Coin"}</button>)}
      </div>
      {kind === "creator-coin" && <div className="mt-4 rounded-xl border border-white/10 p-4">
        {myCoin ? <>
          <div className="flex items-center justify-between">
            <span className="font-semibold">{myCoin.symbol}</span>
            <Badge tone={myCoin.mintStatus === "minted" ? "up" : "neutral"}>{mintLabel(myCoin.mintStatus)}</Badge>
          </div>
          <div className="mt-1 text-sm muted">Created automatically when you made your profile.</div>
          <div className="mt-2 text-sm">{fmtMst(Number(myCoin.price))} MST · holds {myCoin.totalSupply.toLocaleString()} units</div>
        </> : <p className="text-sm muted">Loading your coin…</p>}
      </div>}
      {!isConnected
        ? <Button onClick={() => void connect()} className="w-full mt-5">Connect BridgeKey to publish</Button>
        : !isCorrectNetwork
          ? <div className="mt-5"><NetworkSwitchButton /></div>
          : <Button onClick={() => void publish()} disabled={(kind === "post" && !caption.trim()) || busy} className="w-full mt-5">
            {busy ? <><Loader2 size={16} className="animate-spin" />Publishing…</>
              : kind === "creator-coin" ? "Mint Creator Coin" : "Publish & Mint NFT"}</Button>}
      <div className="text-[11px] muted mt-3 space-y-1">
        {(local === "uploading" || local === "metadata" || local === "chain") && <p>Saving to feed… then BridgeKey will ask you to mint on MST Testnet.</p>}
        {error && stage === "idle" && <p className="text-red-400">{error}</p>}
      </div>
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={closeTx} title={kind === "post" ? "Mint Post NFT" : "Mint Creator Coin"} />}
  </>;
}
