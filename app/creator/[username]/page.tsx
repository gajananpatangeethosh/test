"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { BadgeCheck, MapPin } from "lucide-react";
import { AppShell } from "@/components/shell";
import { Avatar, Card, Badge, Tabs } from "@/components/ui";
import { PostCard } from "@/components/post";
import { CoinChart } from "@/components/chart";
import { PortfolioCard } from "@/components/wallet";
import { creatorByName, creators, posts, coinById } from "@/lib/data";
import { useApp } from "@/lib/store";
import { fmtMst, fmtNum } from "@/lib/utils";
import { fromLiveFeedPost, toMockFeedPost, type FeedPost } from "@/lib/feed";
import { getProfilePageAction, toggleFollowAction } from "@/app/actions/profile";
import { toggleLikeAction } from "@/app/actions/social";
import type { ProfilePublic } from "@/lib/db/types";

export default function CreatorPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [live, setLive] = useState<{ profile: ProfilePublic; posts: FeedPost[]; viewerFollowing: boolean } | null>(null);
  const [checkedLive, setCheckedLive] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [likePending, setLikePending] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState("Posts");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let active = true;
    setCheckedLive(false); setLive(null); setLikes({}); setTab("Posts");
    getProfilePageAction(username).then((r) => {
      if (!active) return;
      if (r.ok) {
        const posts = r.posts.map(fromLiveFeedPost);
        const init: Record<string, { liked: boolean; count: number }> = {};
        for (const p of r.posts) init[p.id] = { liked: p.viewerLiked, count: p.likes };
        setLikes(init);
        setLive({ profile: r.profile, posts, viewerFollowing: r.viewerFollowing });
      }
      setCheckedLive(true);
    }).catch(() => { if (active) setCheckedLive(true); });
    return () => { active = false; };
  }, [username]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onToggleLike = async (id: string) => {
    if (likePending[id]) return;
    setLikePending((p) => ({ ...p, [id]: true }));
    try {
      const r = await toggleLikeAction(id);
      if (r.ok) {
        setLikes((m) => ({ ...m, [id]: { liked: r.liked, count: r.likeCount } }));
        setLive((s) => (s ? { ...s, posts: s.posts.map((p) => (p.id === id ? { ...p, likes: r.likeCount, viewerLiked: r.liked } : p)) } : s));
      }
    } finally { setLikePending((p) => ({ ...p, [id]: false })); }
  };

  const onToggleFollow = async () => {
    if (!live || followPending) return;
    setFollowPending(true);
    try {
      const r = await toggleFollowAction(live.profile.username);
      if (r.ok) {
        setLive((s) => (s ? {
          ...s,
          viewerFollowing: r.following,
          profile: { ...s.profile, followerCount: r.followerCount },
        } : s));
      }
    } finally { setFollowPending(false); }
  };

  if (live) {
    const p = live.profile;
    const joined = p.joinedAt
      ? new Date(`${p.joinedAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })
      : null;
    return <AppShell right={<PortfolioCard />}>
      <div className="py-4 px-3 sm:px-0 space-y-3">
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <Avatar name={p.displayName || p.username} src={p.avatarUrl} size={64} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5"><span className="font-bold text-lg">{p.displayName}</span>{p.verified && <BadgeCheck size={17} className="text-teal-300" />}</div>
              <div className="muted text-sm">@{p.username} · <span className="text-emerald-300">Live profile</span></div>
              <p className="text-sm mt-2">{p.bio}</p>
              <div className="muted text-xs mt-1 flex gap-3">
                {p.location && <span className="flex items-center gap-1"><MapPin size={12} />{p.location}</span>}
                {joined && <span>Joined {joined}</span>}
              </div>
            </div>
            <button onClick={() => void onToggleFollow()} disabled={followPending}
              className={live.viewerFollowing ? "rounded-full border border-white/15 px-5 py-2 text-sm disabled:opacity-60" : "rounded-full bg-white text-black px-5 py-2 text-sm font-medium disabled:opacity-60"}>
              {followPending ? "…" : live.viewerFollowing ? "Following" : "Follow"}</button>
          </div>
          <div className="flex gap-5 mt-4 text-sm"><span><b>{fmtNum(p.followerCount)}</b> <span className="muted">followers</span></span><span><b>{fmtNum(p.followingCount)}</b> <span className="muted">following</span></span><span><b>{p.postCount}</b> <span className="muted">posts</span></span></div>
        </div>
        <Tabs tabs={["Posts", "Coins", "Activity"]} value={tab} onChange={setTab} />
        {tab === "Posts" && (live.posts.length > 0
          ? live.posts.map((post) => <PostCard key={post.id} post={post} like={{
            liked: likes[post.id]?.liked ?? post.viewerLiked ?? false,
            count: likes[post.id]?.count ?? post.likes,
            pending: !!likePending[post.id],
            onToggle: (id) => void onToggleLike(id),
          }} />)
          : <Card className="p-5 text-sm muted">No live posts yet.</Card>)}
        {tab === "Coins" && <Card className="p-4 muted text-sm">No coin launched yet. Coins stay mock in this build.</Card>}
        {tab === "Activity" && <Card className="p-5 text-sm muted">Published {p.postCount} live posts · {fmtNum(p.followerCount)} followers.</Card>}
        <div><div className="font-semibold px-1 my-2">More creators</div>
          <div className="grid gap-2">{creators.filter((x) => x.username !== p.username).slice(0, 3).map((x) => (
            <Card key={x.username} className="p-4 flex items-center gap-3"><Avatar name={x.name} size={40} />
              <Link href={`/creator/${x.username}`} className="flex-1 font-medium text-sm hover:underline">{x.name}<span className="block muted text-xs font-normal">@{x.username} · mock sample</span></Link></Card>))}</div></div>
      </div>
    </AppShell>;
  }

  const c = creatorByName(username);
  if (!c) {
    if (checkedLive) notFound();
    return <AppShell right={<PortfolioCard />}>
      <div className="py-4 px-3 sm:px-0"><div className="card p-4 text-sm muted">Loading profile…</div></div>
    </AppShell>;
  }
  return <MockCreator username={c.username} />;
}

function MockCreator({ username }: { username: string }) {
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
            <div className="muted text-sm">@{c.username} · <span className="text-amber-300">Mock sample</span></div>
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
      {tab === "Posts" && mine.map((p) => <PostCard key={p.id} post={toMockFeedPost(p)} />)}
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
