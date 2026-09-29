"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Tabs, Badge, Card } from "@/components/ui";
import { PortfolioCard, MyCreatorCoin } from "@/components/wallet";
import { getMarketsAction } from "@/app/actions/coins";
import { useApp } from "@/lib/store";
import { coinSourceLabel, fromLiveCoin, type MarketCoin } from "@/lib/markets";
import { fmtMst, fmtNum, cn } from "@/lib/utils";
import { CoinChart } from "@/components/chart";

type SortTab = "Trending" | "New" | "Gainers" | "Volume";

const SORTS: Record<SortTab, (a: MarketCoin, b: MarketCoin) => number> = {
  Trending: (a, b) => b.volume24h * (1 + b.change24h / 100) - a.volume24h * (1 + a.change24h / 100),
  New: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  Gainers: (a, b) => b.change24h - a.change24h,
  Volume: (a, b) => b.volume24h - a.volume24h,
};

export default function Markets() {
  const [tab, setTab] = useState<SortTab>("Trending");
  const [live, setLive] = useState<MarketCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tradeTick = useApp((s) => s.tradeTick);

  useEffect(() => {
    let active = true;
    getMarketsAction()
      .then((r) => { if (!active) return; setLive(r.data.map(fromLiveCoin)); setError(r.liveError); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "MARKETS_FAILED"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tradeTick]);

  const rows = live.sort(SORTS[tab]);
  const liveCount = live.length;

  return <AppShell right={<><MyCreatorCoin /><PortfolioCard limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0">
      <div className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-xl font-bold">Markets</h1>
        <span className="text-xs muted">
          {liveCount > 0 ? `${liveCount} live creator coin${liveCount === 1 ? "" : "s"}` : "No live coins yet"}
        </span>
      </div>
      <div className="mt-3 px-1">
        <Tabs tabs={Object.keys(SORTS) as SortTab[]} value={tab} onChange={(t) => setTab(t as SortTab)} />
      </div>

      {error && <Card className="mt-4 p-4 text-sm border-amber-300/30 bg-amber-300/5 text-amber-200">
        Live ledger unavailable: {error === "DB_NOT_READY" ? "run supabase/migrations/0002_creator_coins.sql in the Supabase SQL editor" : error}.
      </Card>}

      {loading && live.length === 0 && <p className="mt-4 px-1 text-sm muted">Loading live coins…</p>}

      <div className="card mt-4 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 px-5 py-3 text-xs muted border-b border-white/[.06]">
          <span>Coin</span><span className="text-right">Price</span><span className="text-right">24h</span>
          <span className="text-right">Volume</span><span className="text-right">Holders</span>
        </div>
        {rows.length === 0 && <p className="px-5 py-6 text-sm muted">Nothing listed yet.</p>}
        {rows.map((c) => <Link key={`${c.source}-${c.id}`} href={`/coins/${c.id}`}
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 items-center px-5 py-3.5 border-b border-white/[.04] last:border-0 hover:bg-white/[.02] transition">
          <span className="font-medium text-[15px]">
            {c.symbol}
            <span className="block sm:inline muted text-xs font-normal"> {c.name}</span>
            <span className={cn("ml-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium align-middle",
              c.source === "live" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200")}>
              {coinSourceLabel(c.source)}
            </span>
          </span>
          <span className="text-right">{fmtMst(c.price)} <span className="muted text-xs">MST</span></span>
          <span className={`hidden sm:block text-right text-sm ${c.change24h >= 0 ? "tick-up" : "tick-down"}`}>
            {c.change24h >= 0 ? "+" : ""}{c.change24h}%
          </span>
          <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.volume24h)}</span>
          <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.holders)}</span>
        </Link>)}
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        {rows.slice(0, 4).map((c) => <Link key={`${c.source}-${c.id}`} href={`/coins/${c.id}`} className="card p-4">
          <div className="flex justify-between items-center">
            <span className="font-semibold">{c.symbol}</span>
            <Badge tone={c.change24h >= 0 ? "up" : "down"}>{c.change24h >= 0 ? "+" : ""}{c.change24h}%</Badge>
          </div>
          <div className="mt-1"><CoinChart spark={c.spark} height={90} /></div>
        </Link>)}
      </div>
    </div>
  </AppShell>;
}
