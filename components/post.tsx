"use client";
import Link from "next/link";
import { Heart, MessageCircle, Repeat2, Coins, CandlestickChart, BadgeCheck } from "lucide-react";
import { motion } from "framer-motion";
import { coins } from "@/lib/data";
import { sourceLabel, type FeedPost } from "@/lib/feed";
import { useApp } from "@/lib/store";
import { useWallet } from "./mst/wallet-provider";
import { Avatar, Badge } from "./ui";
import { fmtMst, timeAgo, fmtNum, cn } from "@/lib/utils";

export function PostComposer() {
  const { isConnected, connect } = useWallet();
  return <div className="card p-4 mb-4">
    <div className="flex gap-3">
      <Avatar name="YO" />
      <input placeholder="Share something on MST…" className="flex-1 bg-white/[.04] border border-white/10 rounded-full px-4 text-sm outline-none placeholder:text-[#6b7280] focus:border-teal-300/40" />
    </div>
    <div className="flex justify-end mt-3">
      <Link href="/create" onClick={(e) => { if (!isConnected) { e.preventDefault(); void connect(); } }}
        className="rounded-full bg-white text-black text-sm font-medium px-5 py-2">Create</Link>
    </div>
  </div>;
}

export function PostCard({ post, like }: {
  post: FeedPost;
  like?: { liked: boolean; count: number; pending?: boolean; onToggle: (postId: string) => void };
}) {
  const c = post.author;
  const store = useApp();
  const storeLiked = !!store.likes[post.id];
  const liked = like ? like.liked : storeLiked;
  const likeCount = like ? like.count : post.likes + (storeLiked ? 1 : 0);
  const coin = post.coinId ? coins.find((k) => k.id === post.coinId) ?? null : null;
  const toggle = () => {
    if (post.source === "live" && like) like.onToggle(post.id);
    else if (post.source === "mock") store.toggleLike(post.id);
  };
  const { openTrade, openCollect } = store;
  return <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
    className="card card-hover p-4 sm:p-5 mb-3">
    <div className="flex items-center gap-3">
      <Link href={`/creator/${c.username}`}><Avatar name={c.displayName} src={c.avatarUrl} /></Link>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Link href={`/creator/${c.username}`} className="font-semibold text-[15px] hover:underline">{c.displayName}</Link>
          {c.verified && <BadgeCheck size={15} className="text-teal-300" />}
          <span className="muted text-sm">· {timeAgo(post.time)}</span>
          <span className={cn("ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
            post.source === "live" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-amber-300/30 bg-amber-300/10 text-amber-200")}>
            {sourceLabel(post.source)}</span>
        </div>
        <div className="muted text-sm">@{c.username}</div>
      </div>
    </div>
    <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line">{post.caption}</p>
    {post.image && <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.image} alt="" className="w-full object-cover max-h-[420px]" loading="lazy" /></div>}
    <div className="mt-3 flex items-center gap-6 muted text-sm">
      <button onClick={toggle} disabled={like?.pending} className={cn("flex items-center gap-1.5 hover:text-white disabled:opacity-60", liked && "text-rose-400")}>
        <Heart size={18} fill={liked ? "currentColor" : "none"} />{likeCount}</button>
      <span className="flex items-center gap-1.5"><MessageCircle size={18} />{post.comments}</span>
      <span className="flex items-center gap-1.5"><Repeat2 size={18} />{post.shares}</span>
      <span className="ml-auto muted text-xs">{fmtNum(post.collects)} collects</span>
    </div>
    {coin && <Link href={`/coins/${coin.id}`} className="mt-3 flex items-center justify-between rounded-xl bg-white/[.03] border border-white/10 px-4 py-3 hover:border-white/20">
      <div>
        <div className="text-sm font-semibold">{coin.symbol}</div>
        <div className="text-sm muted">{fmtMst(coin.price)} MST <span className={coin.change24h >= 0 ? "tick-up" : "tick-down"}>{coin.change24h >= 0 ? "+" : ""}{coin.change24h}%</span></div>
      </div>
      <Badge tone={coin.change24h >= 0 ? "up" : "down"}>{coin.change24h >= 0 ? "▲" : "▼"} 24h</Badge>
    </Link>}
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button onClick={() => openCollect(post.id)} className="flex items-center justify-center gap-2 rounded-full border border-white/15 py-2.5 text-sm font-medium hover:border-teal-300/50 hover:text-teal-200"><Coins size={16} />Collect</button>
      {coin && <button onClick={() => openTrade(coin.id, "buy")} className="flex items-center justify-center gap-2 rounded-full bg-white text-black py-2.5 text-sm font-medium hover:bg-teal-100"><CandlestickChart size={16} />Trade</button>}
    </div>
  </motion.article>;
}
