"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { fromLiveCoin, mintLabel, type MarketCoin } from "@/lib/markets";
import { getMyCoinAction } from "@/app/actions/coins";
import { fmtMst, fmtNum } from "@/lib/utils";
import { Card } from "./ui";
import { CoinChart } from "./chart";
import { useApp } from "@/lib/store";
import { useWallet } from "./mst/wallet-provider";
import { ExplorerLink } from "./mst/wallet-ui";
import { MintButton } from "./mint-button";

export function ActivityTimeline({ limit, showWalletLink = false }: { limit?: number; showWalletLink?: boolean }) {
  const { txs } = useWallet();
  const items = limit ? txs.slice(0, limit) : txs;
  return <Card className="p-4">
    <div className="font-semibold mb-3">On-chain activity</div>
    {items.length === 0
      ? <p className="muted text-sm">No transactions yet. Trades and collects you confirm in BridgeKey will appear here.</p>
      : <div className="space-y-3">{items.map((t) => (
        <div key={t.hash} className="flex items-center gap-3 text-sm">
          <span className="h-8 w-8 rounded-full bg-white/[.05] border border-white/10 flex items-center justify-center shrink-0">
            <ArrowUpRight size={15} className="text-emerald-400" /></span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate flex-1">{t.label}</div>
              <span className="muted text-xs shrink-0">{new Date(t.time).toLocaleTimeString()}</span>
            </div>
            <div className="muted text-xs font-mono truncate">{t.hash}</div>
            <ExplorerLink hash={t.hash} />
          </div>
        </div>))}</div>}
    {showWalletLink && (
      <Link href="/wallet" className="mt-4 flex items-center justify-center gap-2 rounded-full border border-white/15 py-2.5 text-sm hover:border-white/30">
        <Plus size={15} />View wallet
      </Link>
    )}
  </Card>;
}

/**
 * The signed-in user's own creator coin. It is created automatically by the
 * profiles_creator_coin trigger, so this only ever reads.
 */
export function MyCreatorCoin() {
  const { isConnected } = useWallet();
  const tradeTick = useApp((s) => s.tradeTick);
  const [coin, setCoin] = useState<MarketCoin | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    void getMyCoinAction()
      .then((r) => { if (active) setCoin(r.ok ? fromLiveCoin(r.coin) : null); })
      .catch(() => { if (active) setCoin(null); });
    return () => { active = false; };
  }, [isConnected, tradeTick]);

  if (!isConnected || !coin) return null;
  const minted = coin.mintStatus === "minted";
  return <Card className="p-5">
    <div className="flex items-center justify-between">
      <div className="muted text-sm">Your creator coin</div>
      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">Live</span>
    </div>
    <div className="mt-1 font-bold text-lg">{coin.symbol}</div>
    <div className="text-sm muted">@{coin.creatorUsername}</div>
    <div className="mt-3"><CoinChart spark={coin.spark} height={80} /></div>
    <div className="flex items-baseline justify-between mt-2">
      <span className="text-2xl font-bold">{fmtMst(coin.price)}</span>
      <span className="muted text-xs">MST</span>
    </div>
    <div className="mt-3 flex items-center gap-1.5 text-xs">
      <Sparkles size={12} className={minted ? "text-teal-300" : "text-amber-300"} />
      <span className={minted ? "text-teal-200" : "text-amber-200"}>{mintLabel(coin.mintStatus)}</span>
    </div>
    {coin.viewerHolding > 0 && <div className="mt-2 text-xs muted">You hold {fmtNum(coin.viewerHolding)} {coin.symbol}</div>}
    {!minted && (
      <div className="mt-3">
        <MintButton coinId={coin.id} name={coin.name} symbol={coin.symbol} owner={coin.ownerWallet} />
      </div>
    )}
    <Link href={`/coins/${coin.id}`} className="mt-4 flex items-center justify-center gap-2 rounded-full border border-white/15 py-2.5 text-sm hover:border-white/30">
      Open {coin.symbol}
    </Link>
  </Card>;
}

export function PortfolioCard({ limit = 5 }: { limit?: number }) {
  return <ActivityTimeline limit={limit} showWalletLink />;
}
