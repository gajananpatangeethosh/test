"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal, Button } from "./ui";
import { useApp } from "@/lib/store";
import { coinById, posts } from "@/lib/data";
import { tradeCreatorCoin, collectPost as collectPostTx } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { useWallet } from "./mst/wallet-provider";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import { fmtMst } from "@/lib/utils";
import type { TxStage } from "@/lib/mst/types";

export function TradeModal() {
  const { tradeModal, closeTrade } = useApp();
  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("5");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const coin = tradeModal ? coinById(tradeModal.coinId) : null;
  const close = () => { closeTrade(); setStage("idle"); setHash(""); setError(null); };
  const doTrade = async () => {
    if (!coin) return;
    setError(null); setHash("");
    try {
      // Deployment-gated: throws NOT_DEPLOYED until marketplace ships. No fake hashes.
      const h = await tradeCreatorCoin({ coin: coin.id, side, amountMst: amt });
      setHash(h); setStage("confirmed");
      addTx({ hash: h, from: address, to: coin.symbol, label: `${side} ${coin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
    } catch (e) {
      const m = toMstError(e);
      // Surface lifecycle for wallet-level failures so users see honest status
      if (m.code === "NOT_DEPLOYED") { setError(m.message); setStage("failed"); }
      else { setError(m.message); setStage("failed"); }
    }
  };
  return <>
    <Modal open={!!tradeModal && stage === "idle"} onClose={close}>
      {!coin ? null : <>
        <div className="font-semibold text-lg">{side === "buy" ? "Buy" : "Sell"} {coin.symbol}</div>
        <div className="muted text-sm">{fmtMst(coin.price)} MST (market preview, off-chain)</div>
        {!isConnected && <div className="mt-4"><Button onClick={() => void connect()} className="w-full">Connect BridgeKey to trade</Button></div>}
        {isConnected && !isCorrectNetwork && <div className="mt-4"><NetworkSwitchButton /></div>}
        <div className="grid grid-cols-2 gap-2 mt-4 rounded-full bg-white/[.04] border border-white/10 p-1">
          {(["buy", "sell"] as const).map((s) => <button key={s} onClick={() => setSide(s)}
            className={`rounded-full py-2 text-sm font-medium capitalize ${side === s ? "bg-white text-black" : "text-[#9aa0ab]"}`}>{s}</button>)}
        </div>
        <label className="block mt-4 text-sm muted">Amount (MST)</label>
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal"
          className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 outline-none focus:border-teal-300/50" />
        <div className="flex gap-2 mt-3">{["1", "5", "10", "25"].map((v) => <button key={v} onClick={() => setAmt(v)}
          className="flex-1 rounded-full border border-white/10 py-1.5 text-sm muted hover:text-white hover:border-white/25">{v}</button>)}</div>
        <div className="muted text-sm mt-3">You receive ≈ {fmtMst((Number(amt) || 0) / coin.price)} {coin.symbol}</div>
        <Button disabled={!isConnected || !isCorrectNetwork} onClick={() => { setStage("preparing"); void doTrade(); }} className="w-full mt-4">
          Confirm {side} on MST</Button>
        <p className="text-[11px] muted text-center mt-2">Signed in BridgeKey. No success is shown until on-chain confirmation.</p>
      </>}
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title={coin ? `${side === "buy" ? "Buy" : "Sell"} ${coin.symbol}` : "Trade"} />}
  </>;
}

export function CollectModal() {
  const { collectPost, closeCollect } = useApp();
  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId } = useWallet();
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const post = posts.find((p) => p.id === collectPost);
  const close = () => { closeCollect(); setStage("idle"); setHash(""); setError(null); };
  const collect = async () => {
    if (!post?.coinId) { setError("This post has no coin to collect."); setStage("failed"); return; }
    setError(null); setHash("");
    try {
      const h = await collectPostTx({ coin: post.coinId });
      setHash(h); setStage("confirmed");
      addTx({ hash: h, from: address, to: post.coinId, label: `Collect ${post.coinId}`, time: Date.now(), chainId: chainId ?? 0 });
    } catch (e) { setError(toMstError(e).message); setStage("failed"); }
  };
  return <>
    <Modal open={!!collectPost && stage === "idle"} onClose={close}>
      <div className="font-semibold text-lg">Collect post</div>
      <p className="muted text-sm mt-1 line-clamp-2">{post?.caption}</p>
      <div className="mt-4 rounded-xl border border-white/10 p-4 text-sm flex justify-between"><span className="muted">Edition price</span><span>0.5 MST</span></div>
      {!isConnected
        ? <Button onClick={() => void connect()} className="w-full mt-4">Connect BridgeKey to collect</Button>
        : !isCorrectNetwork
          ? <div className="mt-4"><NetworkSwitchButton /></div>
          : <Button onClick={() => { setStage("preparing"); void collect(); }} className="w-full mt-4">Collect on MST</Button>}
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title="Collect post" />}
  </>;
}

// Legacy export kept for the create page (now driven by real tx status there).
export function TransactionModal({ step, hash, onClose }: { step: null; hash: string; onClose: () => void }) {
  void step; void hash; void onClose; return null;
}
export function TxPendingHint() {
  return <span className="inline-flex items-center gap-1.5 text-xs muted"><Loader2 size={12} className="animate-spin" />Waiting for wallet…</span>;
}
