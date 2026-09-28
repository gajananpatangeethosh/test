"use client";
import { use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell";
import { PostCard } from "@/components/post";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
import { posts, coinById } from "@/lib/data";
import { postById } from "@/lib/search";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const post = postById(id);
  if (!post) notFound();
  const more = posts.filter((p) => p.creator === post.creator && p.id !== post.id).slice(0, 3);
  const coin = post.coinId ? coinById(post.coinId) : null;
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={4} /></>}>
    <div className="py-4 px-3 sm:px-0 space-y-3">
      <Link href="/home" className="inline-flex items-center gap-1.5 muted text-sm hover:text-white px-1">
        <ArrowLeft size={15} />Back to feed
      </Link>
      <PostCard post={post} />
      {coin && <Link href={`/coins/${coin.id}`} className="block card card-hover p-4 text-sm">
        <span className="muted text-xs block mb-1">Collected on</span>
        <span className="font-semibold">{coin.symbol}</span>
        <span className="muted"> · {coin.name} · @{coin.creator}</span>
      </Link>}
      {more.length > 0 && <>
        <div className="muted text-xs uppercase tracking-wide px-1 pt-2">More from @{post.creator}</div>
        {more.map((p) => <PostCard key={p.id} post={p} />)}
      </>}
    </div>
  </AppShell>;
}
