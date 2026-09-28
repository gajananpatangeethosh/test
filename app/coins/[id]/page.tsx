"use client";
import Link from "next/link";
import { use } from "react";
import { BadgeCheck, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Badge, Button, Card, Avatar } from "@/components/ui";
import { CoinChart } from "@/components/chart";
import { PostCard } from "@/components/post";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
import { coinById, creatorByName, posts, recentTrades, coins } from "@/lib/data";
import { useApp } from "@/lib/store";
import { fmtMst, fmtNum, timeAgo } from "@/lib/utils";
export default function CoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const coin = coinById(id);
  const creator = creatorByName(coin.creator);
  const { openTrade, openCollect } = useApp();
  const up = coin.change24h >= 0;
  const related = posts.filter((p) => p.coinId === coin.id);
  const trades = recentTrades(coin.id);
  const stats: [string, string][] = [
    ["Market cap", `${fmtNum(coin.marketCap)} MST`], ["Liquidity", `${fmtNum(coin.liquidity)} MST`],
    ["Volume 24h", `${fmtNum(coin.volume24h)} MST`], ["Holders", fmtNum(coin.holders)],
  ];
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={coin.name} size={48} />
          <div className="flex-1"><div className="font-bold text-lg">{coin.name} <span className="muted font-normal text-sm">{coin.symbol}</span></div>
            <Link href={`/creator/${creator.username}`} className="text-sm text-teal-300 hover:underline flex items-center gap-1">@{creator.username} {creator.verified && <BadgeCheck size={14} />}</Link></div>
          <Badge tone={up ? "up" : "down"}>{up ? "+" : ""}{coin.change24h}% 24h</Badge>
        </div>
        <div className="mt-4 text-3xl font-bold">{fmtMst(coin.price)} <span className="text-sm muted font-normal">MST</span></div>
        <div className="mt-3"><CoinChart spark={coin.spark} height={240} /></div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button onClick={() => openTrade(coin.id, "buy")}>Buy {coin.symbol}</Button>
          <Button variant="outline" onClick={() => openTrade(coin.id, "sell")}>Sell</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{stats.map(([k, v]) => (
        <Card key={k} className="p-4"><div className="muted text-xs">{k}</div><div className="font-semibold mt-1">{v}</div></Card>))}</div>
      <Card className="p-5">
        <div className="font-semibold mb-3">Recent trades</div>
        {trades.map((t) => <div key={t.id} className="flex items-center gap-2 text-sm py-2 border-b border-white/[.04] last:border-0">
          <span className={t.side === "BUY" ? "tick-up" : "tick-down"}>{t.side === "BUY" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}</span>
          <span className="muted">@{t.trader}</span>
          <span className="ml-auto">{t.amount} {coin.symbol}</span>
          <span className="muted text-xs w-20 text-right">{timeAgo(t.time)}</span></div>)}
      </Card>
      {related.length > 0 && <div><div className="font-semibold px-1 mb-2">Related posts</div>
        {related.map((p) => <PostCard key={p.id} post={p} />)}</div>}
      <div><div className="font-semibold px-1 mb-2">More coins</div>
        <div className="grid grid-cols-2 gap-2">{coins.filter((c) => c.id !== coin.id).slice(0, 4).map((c) => (
          <Link key={c.id} href={`/coins/${c.id}`} className="card card-hover p-4"><div className="font-semibold text-sm">{c.symbol}</div>
            <div className="muted text-xs">{fmtMst(c.price)} MST · <span className={c.change24h >= 0 ? "tick-up" : "tick-down"}>{c.change24h}%</span></div></Link>))}</div></div>
    </div>
  </AppShell>;
}
