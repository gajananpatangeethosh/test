"use client";
import Link from "next/link";
import { use } from "react";
import { BadgeCheck, MapPin } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Avatar, Card, Badge, Tabs } from "@/components/ui";
import { PostCard } from "@/components/post";
import { CoinChart } from "@/components/chart";
import { PortfolioCard } from "@/components/wallet";
import { creatorByName, creators, posts, coinById } from "@/lib/data";
import { useApp } from "@/lib/store";
import { fmtMst, fmtNum } from "@/lib/utils";
import { useState } from "react";
export default function CreatorPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const c = creatorByName(username);
  const { follows, toggleFollow, openTrade } = useApp();
  const [tab, setTab] = useState("Posts");
  const mine = posts.filter((p) => p.creator === c.username);
  const coin = c.coinId ? coinById(c.coinId) : null;
  const f = !!follows[c.username];
  return <AppShell right={<PortfolioCard />}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <Avatar name={c.name} size={64} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5"><span className="font-bold text-lg">{c.name}</span>{c.verified && <BadgeCheck size={17} className="text-teal-300" />}</div>
            <div className="muted text-sm">@{c.username}</div>
            <p className="text-sm mt-2">{c.bio}</p>
            <div className="muted text-xs mt-1 flex gap-3"><span className="flex items-center gap-1"><MapPin size={12} />{c.location}</span><span>Joined {c.joined}</span></div>
          </div>
          <button onClick={() => toggleFollow(c.username)}
            className={f ? "rounded-full border border-white/15 px-5 py-2 text-sm" : "rounded-full bg-white text-black px-5 py-2 text-sm font-medium"}>{f ? "Following" : "Follow"}</button>
        </div>
        <div className="flex gap-5 mt-4 text-sm"><span><b>{fmtNum(c.followers)}</b> <span className="muted">followers</span></span><span><b>{fmtNum(c.following)}</b> <span className="muted">following</span></span><span><b>{mine.length}</b> <span className="muted">posts</span></span></div>
      </div>
      {coin && <Link href={`/coins/${coin.id}`} className="card card-hover p-5 block">
        <div className="flex items-center justify-between"><div className="font-semibold">Creator coin · {coin.symbol}</div>
          <Badge tone={coin.change24h >= 0 ? "up" : "down"}>{coin.change24h >= 0 ? "+" : ""}{coin.change24h}%</Badge></div>
        <div className="text-2xl font-bold mt-1">{fmtMst(coin.price)} <span className="text-xs muted font-normal">MST</span></div>
        <div className="mt-2"><CoinChart spark={coin.spark} height={110} /></div>
        <span className="mt-3 inline-block rounded-full bg-white text-black text-sm font-medium px-5 py-2" onClick={(e) => { e.preventDefault(); openTrade(coin.id, "buy"); }}>Trade {coin.symbol}</span>
      </Link>}
      <Tabs tabs={["Posts", "Coins", "Activity"]} value={tab} onChange={setTab} />
      {tab === "Posts" && mine.map((p) => <PostCard key={p.id} post={p} />)}
      {tab === "Coins" && <div className="grid sm:grid-cols-2 gap-2">
        {coin ? <Card className="p-4"><div className="font-semibold">{coin.symbol}</div><div className="muted text-sm">{fmtMst(coin.price)} MST · {fmtNum(coin.holders)} holders</div></Card>
        : <Card className="p-4 muted text-sm">No coin launched yet.</Card>}</div>}
      {tab === "Activity" && <Card className="p-5 text-sm muted">Collected 3 editions · Traded $FOOD · Published {mine.length} posts this month.</Card>}
      <div><div className="font-semibold px-1 my-2">More creators</div>
        <div className="grid gap-2">{creators.filter((x) => x.username !== c.username).slice(0, 3).map((x) => (
          <Card key={x.username} className="p-4 flex items-center gap-3"><Avatar name={x.name} size={40} />
            <Link href={`/creator/${x.username}`} className="flex-1 font-medium text-sm hover:underline">{x.name}<span className="block muted text-xs font-normal">@{x.username}</span></Link></Card>))}</div></div>
    </div>
  </AppShell>;
}
