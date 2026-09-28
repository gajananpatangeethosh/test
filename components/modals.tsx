"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal, Button } from "./ui";
import { useApp } from "@/lib/store";
import { posts } from "@/lib/data";
import { isLiveCoin, isMarketplaceDeployed, isOnChain, usesBridgeKeyTrades } from "@/lib/markets";
import { tradeCreatorCoin } from "@/lib/mst/contracts";
import { toMstError } from "@/lib/mst/errors";
import { useWallet } from "./mst/wallet-provider";
import { TransactionStatus } from "./mst/tx-status";
import { NetworkSwitchButton } from "./mst/wallet-ui";
import { tradeCoinAction } from "@/app/actions/coins";
import { buyPostCoinAction } from "@/app/actions/post-coins";
import { toMarketCoinFromPostCoin, usesBridgeKeyPostBuy } from "@/lib/post-coins";
import { fmtMst, fmtNum } from "@/lib/utils";
import type { TxStage } from "@/lib/mst/types";

const TRADE_ERRORS: Record<string, string> = {
  INSUFFICIENT_COIN_BALANCE: "You do not hold enough of this coin to sell.",
  INVALID_COIN_AMOUNT: "Enter an amount greater than zero.",
  COIN_AMOUNT_TOO_LARGE: "That amount is above the per-trade limit.",
  COIN_AMOUNT_TOO_SMALL: "That amount is too small to execute.",
  COIN_SUPPLY_EXHAUSTED: "This coin has no supply left in the pool.",
  POOL_EMPTY: "The pool cannot pay out right now.",
  PROFILE_REQUIRED: "Create your live profile before trading.",
  COIN_NOT_FOUND: "That coin no longer exists.",
  UNAUTHENTICATED: "Sign in with your wallet to trade.",
  DB_NOT_READY: "Live database is not migrated yet. Run supabase/migrations/0002_creator_coins.sql.",
};

function tradeError(error: string): string {
  return TRADE_ERRORS[error] ?? toMstError(new Error(error)).message;
}

export function TradeModal() {
  const { tradeModal, closeTrade, tradeTick, setTradeTick } = useApp();
  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("5");
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const coin = tradeModal?.coin ?? null;
  const live = coin ? isLiveCoin(coin) : false;
  const close = () => { closeTrade(); setStage("idle"); setHash(""); setError(null); };

  // Presets are fractions of the wallet: sells need a unit count, buys MST.
  const presets = side === "buy" ? ["1", "5", "10", "25"] : ["10%", "25%", "50%", "100%"];

  const doTrade = async () => {
    if (!coin) return;
    setError(null); setHash("");
    const amount = side === "buy" ? Number(amt) : (coin.viewerHolding * Number(amt.replace("%", ""))) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { setError("Enter an amount greater than zero."); setStage("failed"); return; }

    if (live && isMarketplaceDeployed() && !isOnChain(coin)) {
      setError("The creator must mint this coin on MST via BridgeKey before buys can settle on-chain.");
      setStage("failed");
      return;
    }

    if (usesBridgeKeyTrades(coin) && coin.tokenAddress) {
      try {
        const h = await tradeCreatorCoin({
          coin: coin.tokenAddress,
          side,
          amountMst: side === "buy" ? amt : String(amount),
          onStage: setStage,
        });
        setHash(h);
        addTx({ hash: h, from: address, to: coin.symbol, label: `${side} ${coin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
        const r = await tradeCoinAction({ coinId: coin.id, side, amount: +amount.toFixed(8) });
        if (!r.ok) {
          setError(`BridgeKey confirmed the trade, but Echo could not sync the ledger: ${tradeError(r.error)}`);
          setStage("failed");
          return;
        }
        setStage("confirmed");
        setTradeTick(tradeTick + 1);
      } catch (e) {
        setError(tradeError(toMstError(e).message)); setStage("failed");
      }
      return;
    }

    if (live) {
      setStage("preparing");
      const r = await tradeCoinAction({ coinId: coin.id, side, amount: +amount.toFixed(8) });
      if (!r.ok) { setError(tradeError(r.error)); setStage("failed"); return; }
      setStage("confirmed");
      setTradeTick(tradeTick + 1);
      return;
    }
    try {
      const h = await tradeCreatorCoin({ coin: coin.id, side, amountMst: amt, onStage: setStage });
      setHash(h); setStage("confirmed");
      addTx({ hash: h, from: address, to: coin.symbol, label: `${side} ${coin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
    } catch (e) {
      setError(tradeError(toMstError(e).message)); setStage("failed");
    }
  };

  const rawAmount = Number(amt.replace("%", "")) || 0;
  const receive = side === "buy" ? rawAmount / (coin?.price || 1) : ((coin?.viewerHolding ?? 0) * rawAmount) / 100;
  const mintDisabled = side === "sell" && coin !== null && coin.viewerHolding <= 0;

  return <>
    <Modal open={!!tradeModal && stage === "idle"} onClose={close}>
      {coin ? <>
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-lg">{side === "buy" ? "Buy" : "Sell"} {coin.symbol}</div>
          {live
            ? <span className="rounded-full border border-teal-300/30 bg-teal-300/10 px-2 py-0.5 text-[10px] font-medium text-teal-200">
                {usesBridgeKeyTrades(coin) ? "BridgeKey + MST" : coin.settlement === "onchain" ? "On MST" : "Off-chain ledger"}
              </span>
            : <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[#9aa0ab]">Mock sample</span>}
        </div>
        <div className="muted text-sm">{fmtMst(coin.price)} MST
          {live && !isOnChain(coin) && isMarketplaceDeployed() && <span className="text-amber-300/90"> · creator must mint on MST first</span>}
        </div>
        {live && <div className="mt-3 flex gap-3 text-xs muted">
          <span>Pool {fmtMst(coin.liquidity)} MST</span><span>Holders {fmtNum(coin.holders)}</span>
        </div>}
        {!isConnected && <div className="mt-4"><Button onClick={() => void connect()} className="w-full">Connect BridgeKey to trade</Button></div>}
        {isConnected && !isCorrectNetwork && <div className="mt-4"><NetworkSwitchButton /></div>}
        <div className="grid grid-cols-2 gap-2 mt-4 rounded-full bg-white/[.04] border border-white/10 p-1">
          {(["buy", "sell"] as const).map((s) => <button key={s} onClick={() => { setSide(s); setAmt(s === "buy" ? "5" : "25"); }}
            className={`rounded-full py-2 text-sm font-medium capitalize ${side === s ? "bg-white text-black" : "text-[#9aa0ab]"}`}>{s}</button>)}
        </div>
        <label className="block mt-4 text-sm muted">{side === "buy" ? "Amount (MST)" : `Amount (% of ${fmtNum(coin.viewerHolding)} ${coin.symbol})`}</label>
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal"
          className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 outline-none focus:border-teal-300/50" />
        <div className="flex gap-2 mt-3">{presets.map((v) => <button key={v} onClick={() => setAmt(v)}
          className="flex-1 rounded-full border border-white/10 py-1.5 text-sm muted hover:text-white hover:border-white/25">{v}</button>)}</div>
        <div className="muted text-sm mt-3">
          {side === "buy" ? <>You receive ≈ {fmtNum(receive)} {coin.symbol}</>
            : <>You receive ≈ {fmtMst(receive * coin.price)} MST</>}
        </div>
        <Button disabled={!isConnected || !isCorrectNetwork || mintDisabled} onClick={() => { setStage("preparing"); void doTrade(); }} className="w-full mt-4">
          {mintDisabled ? `No ${coin.symbol} to sell` : `Confirm ${side} on MST`}</Button>
        <p className="text-[11px] muted text-center mt-2">
          {live
            ? usesBridgeKeyTrades(coin)
              ? "BridgeKey will ask you to approve this trade on MST."
              : isMarketplaceDeployed()
                ? "Mint on MST first — then buys route through BridgeKey."
                : "Off-chain ledger until the MST contracts ship."
            : "Signed in BridgeKey. No success is shown until on-chain confirmation."}
        </p>
      </> : null}
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={close}
      title={coin ? `${side === "buy" ? "Buy" : "Sell"} ${coin.symbol}` : "Trade"} />}
  </>;
}

export function CollectModal() {
  const { collectPost, closeCollect, setTradeTick, tradeTick } = useApp();
  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId } = useWallet();
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [amt, setAmt] = useState("1");
  const target = collectPost;
  const postCoin = target?.postCoin;
  const mockPost = target ? posts.find((p) => p.id === target.postId) : null;
  const close = () => { closeCollect(); setStage("idle"); setHash(""); setError(null); setAmt("1"); };
  const presets = ["0.5", "1", "2", "5"];
  const spend = Number(amt) || 0;
  const receive = postCoin && spend > 0 ? spend / postCoin.price : 0;

  const buy = async () => {
    if (!postCoin || !target) { setError("This post has no tradable token."); setStage("failed"); return; }
    if (spend <= 0) { setError("Enter an amount greater than zero."); setStage("failed"); return; }
    setError(null); setHash("");
    try {
      if (usesBridgeKeyPostBuy(postCoin) && postCoin.tokenAddress) {
        const h = await tradeCreatorCoin({
          coin: postCoin.tokenAddress,
          side: "buy",
          amountMst: amt,
          onStage: setStage,
        });
        setHash(h);
        addTx({ hash: h, from: address, to: postCoin.symbol, label: `Buy ${postCoin.symbol}`, time: Date.now(), chainId: chainId ?? 0 });
        const r = await buyPostCoinAction({ coinId: postCoin.id, amountMst: spend });
        if (!r.ok) {
          setError(`BridgeKey confirmed but ledger sync failed: ${tradeError(r.error)}`);
          setStage("failed");
          return;
        }
        setStage("confirmed");
        setTradeTick(tradeTick + 1);
        return;
      }
      setStage("preparing");
      const r = await buyPostCoinAction({ coinId: postCoin.id, amountMst: spend });
      if (!r.ok) { setError(tradeError(r.error)); setStage("failed"); return; }
      setStage("confirmed");
      setTradeTick(tradeTick + 1);
    } catch (e) { setError(tradeError(toMstError(e).message)); setStage("failed"); }
  };

  return <>
    <Modal open={!!target && stage === "idle"} onClose={close}>
      <div className="font-semibold text-lg">Buy post NFT</div>
      <p className="muted text-sm mt-1">@{target?.creatorUsername} · {postCoin?.symbol ?? mockPost?.coinId}</p>
      {postCoin && <div className="mt-3 rounded-xl border border-white/10 p-4 text-sm space-y-1">
        <div className="flex justify-between"><span className="muted">Price now</span><span>{fmtMst(postCoin.price)} MST</span></div>
        <div className="flex justify-between"><span className="muted">Your holding</span><span>{fmtNum(postCoin.viewerHolding)} {postCoin.symbol}</span></div>
        <p className="text-xs muted pt-1">More buyers raise the price via the bonding curve.</p>
      </div>}
      <label className="block mt-4 text-sm muted">Spend (MST)</label>
      <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal"
        className="mt-1 w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 outline-none focus:border-teal-300/50" />
      <div className="flex gap-2 mt-3">{presets.map((v) => <button key={v} onClick={() => setAmt(v)}
        className="flex-1 rounded-full border border-white/10 py-1.5 text-sm muted hover:text-white hover:border-white/25">{v}</button>)}</div>
      {postCoin && spend > 0 && <p className="muted text-sm mt-3">You receive ≈ {fmtNum(receive)} {postCoin.symbol}</p>}
      {!isConnected
        ? <Button onClick={() => void connect()} className="w-full mt-4">Connect BridgeKey to buy</Button>
        : !isCorrectNetwork
          ? <div className="mt-4"><NetworkSwitchButton /></div>
          : <Button onClick={() => { setStage("preparing"); void buy(); }} disabled={postCoin?.mintStatus !== "minted"} className="w-full mt-4">
            {postCoin?.mintStatus === "minted" ? "Buy on MST Testnet" : "Waiting for creator to mint…"}
          </Button>}
      <p className="text-[11px] muted text-center mt-2">Settles on MST Testnet via BridgeKey when minted.</p>
    </Modal>
    {stage !== "idle" && <TransactionStatus stage={stage} hash={hash} error={error} onClose={close} title={`Buy ${postCoin?.symbol ?? "post"}`} />}
  </>;
}

// Legacy export kept for the create page (now driven by real tx status there).
export function TransactionModal({ step, hash, onClose }: { step: null; hash: string; onClose: () => void }) {
  void step; void hash; void onClose; return null;
}
export function TxPendingHint() {
  return <span className="inline-flex items-center gap-1.5 text-xs muted"><Loader2 size={12} className="animate-spin" />Waiting for wallet…</span>;
}
