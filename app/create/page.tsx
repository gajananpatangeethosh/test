"use client";
import { useState } from "react";
import Link from "next/link";
import { ImagePlus, Loader2 } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Button, Card } from "@/components/ui";
import { TransactionStatus } from "@/components/mst/tx-status";
import { NetworkSwitchButton } from "@/components/mst/wallet-ui";
import { useWallet } from "@/components/mst/wallet-provider";
import { createCreatorCoin, createPostCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { cn } from "@/lib/utils";
import type { TxStage } from "@/lib/mst/types";
type PublishStep = "uploading" | "metadata" | "chain" | "done";
export default function Create() {
  const { isConnected, connect, isCorrectNetwork, addTx, address, chainId } = useWallet();
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"post" | "post-coin" | "creator-coin">("post");
  const [symbol, setSymbol] = useState("$CYBERMUMBAI");
  const [local, setLocal] = useState<PublishStep | null>(null);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState("");
  const busy = local === "uploading" || local === "metadata" || (stage !== "idle" && stage !== "confirmed" && stage !== "failed");
  const publish = async () => {
    setError(null); setHash("");
    setLocal("uploading"); await new Promise((r) => setTimeout(r, 700));
    setLocal("metadata"); await new Promise((r) => setTimeout(r, 700));
    if (kind === "post") {
      // Plain posts are off-chain content in this MVP; coins anchor on-chain.
      setDraftId(`draft_${Date.now()}`); setLocal("done"); return;
    }
    setLocal("chain"); setStage("preparing");
    try {
      const h = kind === "creator-coin"
        ? await createCreatorCoin({ name: symbol, symbol })
        : await createPostCoin({ postId: draftId || `draft_${Date.now()}`, name: symbol, symbol });
      setHash(h); setStage("confirmed"); setLocal("done");
      addTx({ hash: h, from: address, label: `Create ${symbol}`, time: Date.now(), chainId: chainId ?? 0 });
    } catch (e) { setError(toMstError(e).message); setStage("failed"); }
  };
  return <AppShell>
    <div className="py-6 px-3 sm:px-0 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">Create on MST</h1>
      <p className="muted text-sm mt-1">Publish a post, mint a post coin, or launch your creator coin.</p>
      <Card className="p-5 mt-5">
        <label className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-white/15 py-10 cursor-pointer hover:border-teal-300/40 transition")}>
          <><ImagePlus className="muted" /><span className="text-sm muted mt-2">Upload media</span>
            <span className="text-xs text-[#5b616b]">PNG, JPG, MP4 — stored locally in this MVP</span></>
          <input type="file" accept="image/*,video/*" className="hidden" />
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
          {local === "done" && kind === "post" && <p className="text-emerald-300">Draft saved locally ({draftId}). On-chain post registry ships with the contracts.</p>}
        </div>
      </Card>
      {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={() => setStage("idle")} title={`Create ${symbol}`} />}
      {local === "done" && kind === "post" && <Link href="/home" className="block text-center text-sm text-teal-300 mt-4 hover:underline">Back to feed →</Link>}
    </div>
  </AppShell>;
}
