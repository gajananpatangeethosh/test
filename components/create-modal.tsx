"use client";
import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button, Modal } from "./ui";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import { useWallet } from "./mst/wallet-provider";
import { createCreatorCoin, createPostCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { cn } from "@/lib/utils";
import { createPostAction } from "@/app/actions/posts";
import type { TxStage } from "@/lib/mst/types";

type PublishStep = "uploading" | "metadata" | "chain" | "done";

export function CreateModal({ onClose, onPublished }: { onClose: () => void; onPublished?: (postId: string) => void }) {
  const { isConnected, connect, isCorrectNetwork, addTx, address, chainId } = useWallet();
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"post" | "post-coin" | "creator-coin">("post");
  const [symbol, setSymbol] = useState("$CYBERMUMBAI");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [local, setLocal] = useState<PublishStep | null>(null);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState("");
  const busy = local === "uploading" || local === "metadata" || (stage !== "idle" && stage !== "confirmed" && stage !== "failed");

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
        setLocal("done");
        onPublished?.(r.post.id);
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "CREATE_POST_FAILED");
        setLocal(null);
        return;
      }
    }
    setLocal("uploading"); await new Promise((r) => setTimeout(r, 700));
    setLocal("metadata"); await new Promise((r) => setTimeout(r, 700));
    setLocal("chain"); setStage("preparing");
    try {
      const postId = draftId || `draft_${Date.now()}`;
      setDraftId(postId);
      const h = kind === "creator-coin"
        ? await createCreatorCoin({ name: symbol, symbol })
        : await createPostCoin({ postId, name: symbol, symbol });
      setHash(h); setStage("confirmed"); setLocal("done");
      addTx({ hash: h, from: address, label: `Create ${symbol}`, time: Date.now(), chainId: chainId ?? 0 });
    } catch (e) { setError(toMstError(e).message); setStage("failed"); }
  };

  return <>
    <Modal open onClose={onClose} wide>
      <div className="font-semibold text-lg">Create on MST</div>
      <p className="muted text-sm mt-1">Publish a post, mint a post coin, or launch your creator coin.</p>
      <label className={cn("mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 py-8 cursor-pointer hover:border-teal-300/40 transition")}>
        {preview ? <>
          {file?.type.startsWith("video/")
            ? <video src={preview} className="max-h-48 rounded-lg" controls />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={preview} alt="Upload preview" className="max-h-48 rounded-lg object-cover" />}
          <span className="text-sm muted mt-2">{file?.name}</span>
          <span className="text-xs text-[#5b616b]">Tap to replace · uploads to Supabase Storage on publish</span>
        </> : <><ImagePlus className="muted" /><span className="text-sm muted mt-2">Upload media</span>
          <span className="text-xs text-[#5b616b]">PNG, JPG, WEBP, AVIF, MP4 — optional for text posts</span></>}
        <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4" className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])} />
      </label>
      <label className="block text-sm muted mt-4">Caption</label>
      <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} placeholder="What did you make today?"
        className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#5b616b]" />
      <div className="text-sm muted mt-4 mb-2">Create as</div>
      <div className="grid grid-cols-3 gap-2">
        {(["post", "post-coin", "creator-coin"] as const).map((k) => <button key={k} onClick={() => setKind(k)}
          className={cn("rounded-xl border px-3 py-3 text-sm capitalize transition", kind === k ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:border-white/25")}>
          {k === "post" ? "Post" : k === "post-coin" ? "Post Coin" : "Creator Coin"}</button>)}
      </div>
      {kind !== "post" && <>
        <label className="block text-sm muted mt-4">Coin symbol</label>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-teal-300/50" />
      </>}
      {!isConnected
        ? <Button onClick={() => void connect()} className="w-full mt-5">Connect BridgeKey to publish</Button>
        : !isCorrectNetwork
          ? <div className="mt-5"><NetworkSwitchButton /></div>
          : <Button onClick={() => void publish()} disabled={!caption.trim() || busy} className="w-full mt-5">
            {busy ? <><Loader2 size={16} className="animate-spin" />Publishing…</> : "Publish on MST"}</Button>}
      <div className="text-[11px] muted mt-3 space-y-1">
        {(local === "uploading" || local === "metadata" || local === "chain") && <p>Uploading… creating metadata…</p>}
        {error && <p className="text-red-400">{error}</p>}
      </div>
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={() => setStage("idle")} title={`Create ${symbol}`} />}
  </>;
}
