"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell";
import { PortfolioCard } from "@/components/wallet";
import { useWallet } from "@/components/mst/wallet-provider";

export default function ProfileRedirect() {
  const router = useRouter();
  const { address } = useWallet();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let live = true;
    if (!address) { void Promise.resolve().then(() => { if (live) setChecked(true); }); return; }
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (r) => {
        const me = (await r.json()) as { profile?: { username?: string } | null };
        if (live && me?.profile?.username) router.replace(`/creator/${me.profile.username}`);
        if (live) setChecked(true);
      })
      .catch(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [address, router]);

  return <AppShell right={<PortfolioCard />}>
    <div className="py-4 px-3 sm:px-0">
      <div className="card p-4 text-sm muted">{checked ? "Finish your live profile to open it here." : "Opening your live profile…"}</div>
    </div>
  </AppShell>;
}
