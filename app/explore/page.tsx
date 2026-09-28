"use client";
import { useState } from "react";
import { AppShell } from "@/components/shell";
import { PostCard } from "@/components/post";
import { CreatorCard, CoinCard } from "@/components/cards";
import { Tabs } from "@/components/ui";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
import { posts, creators, coins } from "@/lib/data";
export default function Explore() {
  const [tab, setTab] = useState("Posts");
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0 space-y-4">
      <h1 className="text-xl font-bold px-1">Explore</h1>
      <Tabs tabs={["Posts", "Creators", "Coins"]} value={tab} onChange={setTab} />
      {tab === "Posts" && posts.slice(0, 10).map((p) => <PostCard key={p.id} post={p} />)}
      {tab === "Creators" && <div className="grid gap-2">{creators.map((c) => <CreatorCard key={c.username} creator={c} />)}</div>}
      {tab === "Coins" && <div className="grid sm:grid-cols-2 gap-2">{coins.map((k) => <CoinCard key={k.id} coin={k} />)}</div>}
    </div>
  </AppShell>;
}
