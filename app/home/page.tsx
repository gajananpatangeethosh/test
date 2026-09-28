"use client";
import { AppShell } from "@/components/shell";
import { PostComposer, PostCard } from "@/components/post";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
import { posts } from "@/lib/data";
export default function Home() {
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={5} /></>}>
    <div className="py-4 px-3 sm:px-0">
      <PostComposer />
      {posts.map((p) => <PostCard key={p.id} post={p} />)}
    </div>
  </AppShell>;
}
