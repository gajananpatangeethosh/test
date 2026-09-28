"use client";
import { AppShell } from "@/components/shell";
import { Feed } from "@/components/feed";
import { PortfolioCard, ActivityTimeline } from "@/components/wallet";
export default function Home() {
  return <AppShell right={<><PortfolioCard /><ActivityTimeline limit={5} /></>}>
    <div className="py-4 px-3 sm:px-0">
      <Feed scope="home" composer />
    </div>
  </AppShell>;
}
