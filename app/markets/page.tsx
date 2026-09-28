"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Tabs, Badge } from "@/components/ui";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
import { coins } from "@/lib/data";
import { fmtMst, fmtNum } from "@/lib/utils";
import { CoinChart } from "@/components/chart";
export default function Markets() {
  const [tab, setTab] = useState("Trending");
  const rows = [...coins].sort((a, b) =>
    tab === "Gainers" ? b.change24h - a.change24h : tab === "Volume" ? b.volume24h - a.volume24h : tab === "New" ? +new Date(b.createdAt) - +new Date(a.createdAt) : b.volume24h * b.change24h - a.volume24h * a.change24h);
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0">
      <h1 className="text-xl font-bold px-1">Markets</h1>
      <div className="mt-3 px-1"><Tabs tabs={["Trending", "New", "Gainers", "Volume"]} value={tab} onChange={setTab} /></div>
      <div className="card mt-4 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 px-5 py-3 text-xs muted border-b border-white/[.06]"> <span>Coin</span><span className="text-right">Price</span><span className="text-right">24h</span><span className="text-right">Volume</span><span className="text-right">Holders</span></div>
        {rows.map((c) => <Link key={c.id} href={`/coins/${c.id}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 items-center px-5 py-3.5 border-b border-white/[.04] last:border-0 hover:bg-white/[.02] transition">
          <span className="font-medium text-[15px]">{c.symbol}<span className="block sm:inline muted text-xs font-normal"> {c.name}</span></span>
          <span className="text-right sm:order-none">{fmtMst(c.price)} <span className="muted text-xs">MST</span></span>
          <span className={`hidden sm:block text-right text-sm ${c.change24h >= 0 ? "tick-up" : "tick-down"}`}>{c.change24h >= 0 ? "+" : ""}{c.change24h}%</span>
          <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.volume24h)}</span>
          <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.holders)}</span>
        </Link>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mt-4">{rows.slice(0, 4).map((c) => (
        <Link key={c.id} href={`/coins/${c.id}`} className="card p-4"><div className="flex justify-between items-center">
          <span className="font-semibold">{c.symbol}</span>
          <Badge tone={c.change24h >= 0 ? "up" : "down"}>{c.change24h >= 0 ? "+" : ""}{c.change24h}%</Badge></div>
          <div className="mt-1"><CoinChart spark={c.spark} height={90} /></div></Link>))}
      </div>
    </div>
  </AppShell>;
}
