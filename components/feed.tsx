"use client";
import { useEffect, useState } from "react";
import { PostCard, PostComposer } from "./post";
import { fromLiveFeedPost, type FeedPost } from "@/lib/feed";
import { getFeedAction } from "@/app/actions/posts";
import { toggleLikeAction } from "@/app/actions/social";
import { useApp } from "@/lib/store";

function liveErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "DB_NOT_READY") return "Live database tables are missing. Run supabase/migrations/0001_init.sql.";
  if (code.startsWith("DB_NOT_CONFIGURED")) return "Supabase is not configured in this environment.";
  return "Live feed is temporarily unavailable.";
}

export function Feed({ scope, composer = false, onCreatePost, refreshKey = 0 }: {
  scope: "home" | "explore"; composer?: boolean; onCreatePost?: () => void; refreshKey?: number;
}) {
  const [live, setLive] = useState<FeedPost[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const tradeTick = useApp((s) => s.tradeTick);
  const [likes, setLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    getFeedAction(30)
      .then((r) => {
        if (!active) return;
        const rows = r.data.map(fromLiveFeedPost);
        setLive(rows);
        setLiveError(r.liveError);
        const init: Record<string, { liked: boolean; count: number }> = {};
        for (const p of r.data) init[p.id] = { liked: p.viewerLiked, count: p.likes };
        setLikes(init);
      })
      .catch(() => { if (active) setLiveError("FEED_FAILED"); })
      .finally(() => { if (active) setLoadingLive(false); });
    return () => { active = false; };
  }, [refreshKey, tradeTick]);

  const onToggle = async (id: string) => {
    if (pending[id]) return;
    setPending((p) => ({ ...p, [id]: true }));
    try {
      const r = await toggleLikeAction(id);
      if (r.ok) {
        setLikes((m) => ({ ...m, [id]: { liked: r.liked, count: r.likeCount } }));
        setLive((rows) => rows.map((p) => (p.id === id ? { ...p, likes: r.likeCount, viewerLiked: r.liked } : p)));
      }
    } finally {
      setPending((p) => ({ ...p, [id]: false }));
    }
  };

  const visibleLive = scope === "explore" ? live.slice(0, 10) : live;
  const problem = liveErrorMessage(liveError);

  return <>
    {composer && <PostComposer onCreate={onCreatePost ?? (() => undefined)} />}
    <div className="flex items-center gap-2 px-1 mt-1 mb-2">
      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 px-2.5 py-0.5 text-[11px] font-medium">Live</span>
      <span className="muted text-xs">{loadingLive ? "Loading live posts…" : `${visibleLive.length} live posts`}</span>
    </div>
    {problem && scope === "explore" && <div className="card p-4 mb-3 text-sm muted">{problem}</div>}
    {visibleLive.map((p) => <PostCard key={p.id} post={p} like={{
      liked: likes[p.id]?.liked ?? p.viewerLiked ?? false,
      count: likes[p.id]?.count ?? p.likes,
      pending: !!pending[p.id],
      onToggle: (id) => void onToggle(id),
    }} />)}
    {scope === "home" && !loadingLive && visibleLive.length === 0 && (
      <div className="card p-4 text-sm muted">
        {problem ?? "No live posts yet. Publish the first one from Create."}
      </div>
    )}
    {!loadingLive && visibleLive.length === 0 && scope === "explore" && !problem && (
      <div className="card p-4 mb-3 text-sm muted">No live posts yet. Publish the first one from Create.</div>
    )}
  </>;
}
