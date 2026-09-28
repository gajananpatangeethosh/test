"use client";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Creator, Coin, creatorByName, coins, creators } from "@/lib/data";
import { useApp } from "@/lib/store";
import { Avatar, Badge, Card } from "./ui";
import { fmtMst, fmtNum } from "@/lib/utils";

export function CreatorCard({ creator }: { creator: Creator }) {
  const { follows, toggleFollow } = useApp();
  const f = !!follows[creator.username];
  const coin = creator.coinId ? undefined : undefined;
  return <Card className="p-4 flex items-center gap-3">
    <Link href={`/creator/${creator.username}`}><Avatar name={creator.name} size={46} /></Link>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1">
        <Link href={`/creator/${creator.username}`} className="font-semibold text-[15px] truncate hover:underline">{creator.name}</Link>
        {creator.verified && <BadgeCheck size={15} className="text-teal-300 shrink-0" />}
      </div>
      <div className="muted text-sm truncate">@{creator.username} · {fmtNum(creator.followers)} followers</div>
    </div>
    <button onClick={() => toggleFollow(creator.username)}
      className={f ? "rounded-full border border-white/15 px-4 py-1.5 text-sm hover:border-white/30" : "rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium"}>
      {f ? "Following" : "Follow"}</button>
  </Card>;
}

export function CoinCard({ coin }: { coin: Coin }) {
  const up = coin.change24h >= 0;
  const c = creatorByName(coin.creator);
  return <Link href={`/coins/${coin.id}`} className="card card-hover p-4 block">
    <div className="flex items-center gap-3">
      <Avatar name={coin.name} size={42} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">{coin.symbol}</div>
        <div className="muted text-xs truncate">{coin.name} · @{c.username}</div>
      </div>
      <Badge tone={up ? "up" : "down"}>{up ? "+" : ""}{coin.change24h}%</Badge>
    </div>
    <div className="mt-2 text-lg font-semibold">{fmtMst(coin.price)} <span className="text-xs muted font-normal">MST</span></div>
    <div className="muted text-xs">Vol {fmtNum(coin.volume24h)} · {fmtNum(coin.holders)} holders</div>
  </Link>;
}

export function TrendingList() {
  return <div className="space-y-4">
    <Card className="p-4">
      <div className="font-semibold mb-3">Trending coins</div>
      <div className="space-y-3">{[...coins].sort((a: Coin, b: Coin) => b.change24h - a.change24h).slice(0, 4).map((k: Coin) => (
        <Link key={k.id} href={`/coins/${k.id}`} className="flex items-center gap-3 hover:bg-white/[.03] rounded-lg p-1 -m-1">
          <Avatar name={k.name} size={34} />
          <div className="flex-1 min-w-0"><div className="text-sm font-medium">{k.symbol}</div>
            <div className="text-xs muted">{fmtMst(k.price)} MST</div></div>
          <span className={`text-xs font-medium ${k.change24h >= 0 ? "tick-up" : "tick-down"}`}>{k.change24h >= 0 ? "+" : ""}{k.change24h}%</span>
        </Link>))}</div>
    </Card>
    <Card className="p-4">
      <div className="font-semibold mb-3">Who to follow</div>
      <div className="space-y-3">{creators.slice(0, 3).map((cr: Creator) => <CreatorCard key={cr.username} creator={cr} />)}</div>
    </Card>
  </div>;
}
