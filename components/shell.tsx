"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Home, Compass, CandlestickChart, PlusSquare, User, Search, Wallet, Orbit } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletButton } from "./mst/wallet-ui";
import { useWallet } from "./mst/wallet-provider";
import { SearchBar } from "./search";
import { Wordmark } from "./wordmark";

const nav = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/orbit", label: "Orbit", icon: Orbit },
  { href: "/markets", label: "Markets", icon: CandlestickChart },
  { href: "/create", label: "Create", icon: PlusSquare },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/profile", label: "Profile", icon: User },
];
export function Sidebar() {
  const path = usePathname();
  return <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 p-4 sticky top-0 h-screen">
    <Link href="/home" className="px-3 py-4 text-xl"><Wordmark /></Link>
    {nav.map((n) => <Link key={n.href + n.label} href={n.href}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition hover:bg-white/5",
        (path === n.href || (n.href !== "/" && path.startsWith(n.href))) ? "bg-white/[.07] text-white font-medium" : "text-[#9aa0ab]")}>
      <n.icon size={20} />{n.label}</Link>)}
    <div className="mt-auto card p-4 text-xs muted leading-relaxed">Create → Discover →<br />Collect → Trade → Earn<br /><span className="text-teal-300/80">Live on MST Blockchain</span></div>
  </aside>;
}
export function Topbar() {
  return <header className="sticky top-0 z-[60] backdrop-blur-xl bg-[#08090b]/80 border-b border-white/[.06]">
    <div className="mx-auto max-w-6xl flex items-center gap-3 px-4 h-14">
      <Link href="/home" className="md:hidden text-lg"><Wordmark /></Link>
      <div className="flex-1 flex justify-center"><SearchBar /></div>
      <div className="ml-auto"><WalletButton /></div>
    </div>
  </header>;
}
export function MobileNav() {
  const path = usePathname();
  const items = [
  { href: "/home", label: "Home", icon: Home },
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/orbit", label: "Orbit", icon: Orbit },
    { href: "/create", label: "Create", icon: PlusSquare },
    { href: "/markets", label: "Markets", icon: CandlestickChart },
    { href: "/profile", label: "Profile", icon: User },
  ];
  return <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-white/[.07] bg-[#0c0d10]/95 backdrop-blur-xl">
    <div className="grid grid-cols-6 py-2">{items.map((n) => <Link key={n.label} href={n.href}
      className={cn("flex flex-col items-center gap-1 py-1 text-[10px]", path === n.href ? "text-white" : "text-[#6b7280]")}>
      <n.icon size={21} />{n.label}</Link>)}</div>
  </nav>;
}
export function AppShell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  // Wallet gate: without a connected wallet the landing page is the app.
  // `restoring` covers the silent-reconnect window so we never bounce a
  // returning user back to landing while discovery is still running.
  const { isConnected, restoring } = useWallet();
  const router = useRouter();
  useEffect(() => {
    if (!restoring && !isConnected) router.replace("/");
  }, [restoring, isConnected, router]);
  if (restoring || !isConnected) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="text-xl"><Wordmark /></div>
      <div className="h-5 w-5 rounded-full border-2 border-white/15 border-t-teal-300 animate-spin" />
    </div>;
  }
  return <div className="min-h-screen">
    <Topbar />
    <div className="mx-auto max-w-6xl flex gap-6 px-0 sm:px-4 pb-24 md:pb-10">
      <Sidebar />
      <main className="flex-1 min-w-0 max-w-2xl mx-auto w-full">{children}</main>
      {right && <aside className="hidden lg:block w-80 shrink-0 py-6 space-y-4 sticky top-14 h-fit">{right}</aside>}
    </div>
    <MobileNav />
  </div>;
}
