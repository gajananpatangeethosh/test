"use client";
import Link from "next/link";
import { Heart, MessageCircle, Repeat2, Coins, CandlestickChart, BadgeCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Post, creatorByName, coinById } from "@/lib/data";
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

export function PostCard({ post }: { post: Post }) {
  const c = creatorByName(post.creator);
  const { likes, toggleLike, openTrade, openCollect } = useApp();
  const liked = !!likes[post.id];
  const coin = post.coinId ? coinById(post.coinId) : null;
  return <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
    className="card card-hover p-4 sm:p-5 mb-3">
    <div className="flex items-center gap-3">
      <Link href={`/creator/${c.username}`}><Avatar name={c.name} /></Link>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Link href={`/creator/${c.username}`} className="font-semibold text-[15px] hover:underline">{c.name}</Link>
          {c.verified && <BadgeCheck size={15} className="text-teal-300" />}
          <span className="muted text-sm">· {timeAgo(post.time)}</span>
        </div>
        <div className="muted text-sm">@{c.username}</div>
      </div>
    </div>
    <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line">{post.caption}</p>
    {post.image && <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.image} alt="" className="w-full object-cover max-h-[420px]" loading="lazy" /></div>}
    <div className="mt-3 flex items-center gap-6 muted text-sm">
      <button onClick={() => toggleLike(post.id)} className={cn("flex items-center gap-1.5 hover:text-white", liked && "text-rose-400")}>
        <Heart size={18} fill={liked ? "currentColor" : "none"} />{post.likes + (liked ? 1 : 0)}</button>
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
