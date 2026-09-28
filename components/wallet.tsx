"use client";
import Link from "next/link";
import { ArrowUpRight, Coins, Plus } from "lucide-react";
import { holdings, coinById } from "@/lib/data";
import { fmtMst, fmtNum } from "@/lib/utils";
import { Card } from "./ui";
import { CoinChart } from "./chart";
import { useApp } from "@/lib/store";
import { useWallet } from "./mst/wallet-provider";
import { BalanceDisplay, ExplorerLink, NetworkIndicator } from "./mst/wallet-ui";

export function ActivityTimeline({ limit = 6 }: { limit?: number }) {
  const { txs } = useWallet();
  const items = txs.slice(0, limit);
  return <Card className="p-4">
    <div className="font-semibold mb-3">On-chain activity</div>
    {items.length === 0
      ? <p className="muted text-sm">No transactions yet. Trades and collects you confirm in BridgeKey will appear here.</p>
      : <div className="space-y-3">{items.map((t) => (
        <div key={t.hash} className="flex items-center gap-3 text-sm">
          <span className="h-8 w-8 rounded-full bg-white/[.05] border border-white/10 flex items-center justify-center shrink-0">
            <ArrowUpRight size={15} className="text-emerald-400" /></span>
          <div className="flex-1 min-w-0"><div className="truncate">{t.label}</div>
            <div className="muted text-xs font-mono truncate">{t.hash}</div>
            <ExplorerLink hash={t.hash} /></div>
        </div>))}</div>}
  </Card>;
}

export function PortfolioCard() {
  const { openTrade } = useApp();
  const { isConnected, balance } = useWallet();
  const watch = holdings.slice(0, 4).map((h) => ({ ...h, coin: coinById(h.coinId) }));
  return <Card className="p-5">
    <div className="muted text-sm">Wallet balance</div>
    <div className="text-3xl font-bold mt-1">
      {isConnected ? <BalanceDisplay /> : <span className="muted text-lg">Not connected</span>}</div>
    <div className="mt-1"><NetworkIndicator /></div>
    <div className="mt-4"><CoinChart spark={coinById("gajanan").spark} height={120} /></div>
    <div className="muted text-xs mt-4 mb-1 flex items-center gap-1.5"><Coins size={12} />Market watchlist (off-chain preview)</div>
    <div className="space-y-2">{watch.map((h) => (
      <button key={h.coinId} onClick={() => openTrade(h.coinId, "sell")} className="w-full flex items-center justify-between rounded-xl hover:bg-white/[.03] p-2 -m-1 text-sm">
        <span className="font-medium">{h.coin.symbol}</span>
        <span className="muted">{fmtNum(h.amount)} · {fmtMst(h.amount * h.coin.price)} MST</span>
      </button>))}</div>
    <Link href="/wallet" className="mt-4 flex items-center justify-center gap-2 rounded-full border border-white/15 py-2.5 text-sm hover:border-white/30"><Plus size={15} />View wallet</Link>
  </Card>;
}
