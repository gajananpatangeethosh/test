"use client";
import { useState } from "react";
import { AppShell } from "@/components/shell";
import { Feed } from "@/components/feed";
import { CreateModal } from "@/components/create-modal";
import { PortfolioCard } from "@/components/wallet";
export default function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  return <AppShell right={<PortfolioCard limit={5} />}>
    <div className="py-4 px-3 sm:px-0">
      <Feed scope="home" composer onCreatePost={() => setCreateOpen(true)} refreshKey={feedKey} />
      {createOpen && <CreateModal
        onClose={() => setCreateOpen(false)}
        onPublished={() => { setCreateOpen(false); setFeedKey((k) => k + 1); }}
      />}
    </div>
  </AppShell>;
}
