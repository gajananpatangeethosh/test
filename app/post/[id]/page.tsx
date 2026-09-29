"use client";
import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell";
import { PostCard } from "@/components/post";
import { Comments } from "@/components/comments";
import { PortfolioCard } from "@/components/wallet";
import { posts, coinById } from "@/lib/data";
import { postById } from "@/lib/search";
import { fromLiveFeedPost, toMockFeedPost, type FeedPost } from "@/lib/feed";
import { getAuthorPostsAction, getPostAction } from "@/app/actions/posts";
import { toggleLikeAction } from "@/app/actions/social";
import type { DbComment } from "@/lib/db/types";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [live, setLive] = useState<FeedPost | null>(null);
  const [liveMore, setLiveMore] = useState<FeedPost[]>([]);
  const [like, setLike] = useState<{ liked: boolean; count: number } | null>(null);
  const [moreLikes, setMoreLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [pending, setPending] = useState(false);
  const [morePending, setMorePending] = useState<Record<string, boolean>>({});
  const [checkedLive, setCheckedLive] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let active = true;
    setCheckedLive(false); setLive(null); setLiveMore([]); setLike(null); setMoreLikes({});
    getPostAction(id).then(async (r) => {
      if (!active) return;
      if (r.ok) {
        const post = fromLiveFeedPost(r.post);
        setLive(post);
        setLike({ liked: post.viewerLiked ?? false, count: post.likes });
        if (post.authorWallet) {
          const more = await getAuthorPostsAction(post.authorWallet, 4);
          if (active && more.ok) {
            const rows = more.posts.map(fromLiveFeedPost).filter((p) => p.id !== post.id).slice(0, 3);
            setLiveMore(rows);
            const init: Record<string, { liked: boolean; count: number }> = {};
            for (const m of more.posts) init[m.id] = { liked: m.viewerLiked, count: m.likes };
            setMoreLikes(init);
          }
        }
      }
      if (active) setCheckedLive(true);
    }).catch(() => { if (active) setCheckedLive(true); });
    return () => { active = false; };
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onToggle = async (postId: string) => {
    if (pending || !live) return;
    setPending(true);
    try {
      const r = await toggleLikeAction(postId);
      if (r.ok) {
        setLike({ liked: r.liked, count: r.likeCount });
        setLive((p) => (p ? { ...p, likes: r.likeCount, viewerLiked: r.liked } : p));
      }
    } finally { setPending(false); }
  };

  const onToggleMore = async (postId: string) => {
    if (morePending[postId]) return;
    setMorePending((p) => ({ ...p, [postId]: true }));
    try {
      const r = await toggleLikeAction(postId);
      if (r.ok) {
        setMoreLikes((m) => ({ ...m, [postId]: { liked: r.liked, count: r.likeCount } }));
        setLiveMore((rows) => rows.map((p) => (p.id === postId ? { ...p, likes: r.likeCount, viewerLiked: r.liked } : p)));
      }
    } finally { setMorePending((p) => ({ ...p, [postId]: false })); }
  };

  if (live) {
    const coin = live.coinId ? (() => { try { return coinById(live.coinId); } catch { return null; } })() : null;
    return <AppShell right={<PortfolioCard limit={4} />}>
      <div className="py-4 px-3 sm:px-0 space-y-3">
        <Link href="/home" className="inline-flex items-center gap-1.5 muted text-sm hover:text-white px-1">
          <ArrowLeft size={15} />Back to feed
        </Link>
        <PostCard post={live} like={{
          liked: like?.liked ?? live.viewerLiked ?? false,
          count: like?.count ?? live.likes,
          pending,
          onToggle: (postId) => void onToggle(postId),
        }} />
        <Comments postId={live.id} source="live" initialComments={[] as DbComment[]} initialCount={live.comments} />
        {coin && <Link href={`/coins/${coin.id}`} className="block card card-hover p-4 text-sm">
          <span className="muted text-xs block mb-1">Collected on</span>
          <span className="font-semibold">{coin.symbol}</span>
          <span className="muted"> · {coin.name} · @{coin.creator}</span>
        </Link>}
        {liveMore.length > 0 && <>
          <div className="muted text-xs uppercase tracking-wide px-1 pt-2">More from @{live.creator}</div>
          {liveMore.map((p) => <PostCard key={p.id} post={p} like={{
            liked: moreLikes[p.id]?.liked ?? p.viewerLiked ?? false,
            count: moreLikes[p.id]?.count ?? p.likes,
            pending: !!morePending[p.id],
            onToggle: (postId) => void onToggleMore(postId),
          }} />)}
        </>}
      </div>
    </AppShell>;
  }

  const post = postById(id);
  if (!post) {
    if (checkedLive) notFound();
    return <AppShell right={<PortfolioCard limit={4} />}>
      <div className="py-4 px-3 sm:px-0"><div className="card p-4 text-sm muted">Loading post…</div></div>
    </AppShell>;
  }
  const feedPost = toMockFeedPost(post);
  const more = posts.filter((p) => p.creator === post.creator && p.id !== post.id).slice(0, 3);
  const coin = post.coinId ? coinById(post.coinId) : null;
  return <AppShell right={<PortfolioCard limit={4} />}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <Link href="/home" className="inline-flex items-center gap-1.5 muted text-sm hover:text-white px-1">
        <ArrowLeft size={15} />Back to feed
      </Link>
      <PostCard post={feedPost} />
      <Comments postId={feedPost.id} source="mock" initialComments={[]} initialCount={feedPost.comments} />
      {coin && <Link href={`/coins/${coin.id}`} className="block card card-hover p-4 text-sm">
        <span className="muted text-xs block mb-1">Collected on</span>
        <span className="font-semibold">{coin.symbol}</span>
        <span className="muted"> · {coin.name} · @{coin.creator}</span>
      </Link>}
      {more.length > 0 && <>
        <div className="muted text-xs uppercase tracking-wide px-1 pt-2">More from @{post.creator}</div>
        {more.map((p) => <PostCard key={p.id} post={toMockFeedPost(p)} />)}
      </>}
    </div>
  </AppShell>;
}
