"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, CandlestickChart, Coins, Compass,
  Heart, MessageCircle, PenLine, Repeat2, Sparkles, Wallet as WalletIcon,
} from "lucide-react";
import { coins, coinById } from "@/lib/data";
import { fmtMst, fmtNum } from "@/lib/utils";
import { Avatar, Badge } from "./ui";
import { CoinChart } from "./chart";
import { Wordmark } from "./wordmark";
import { useWallet } from "./mst/wallet-provider";

const ease = { duration: 0.7, ease: [0.21, 0.65, 0.35, 1] as const };
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return <motion.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-80px" }} transition={{ ...ease, delay }} className={className}>{children}</motion.div>;
}

/* ------------------------------- top nav ------------------------------- */
export function LandingNav() {
  const { isConnected, isConnecting, connect, error } = useWallet();
  return <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#08090b]/75 border-b border-white/[.06]">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-8">
      <Link href="/" className="text-lg"><Wordmark /></Link>
      <nav className="hidden md:flex items-center gap-7 text-sm muted">
        <a href="#how" className="hover:text-white transition">How it works</a>
        <a href="#markets" className="hover:text-white transition">Markets</a>
        <a href="#orbit" className="hover:text-white transition">Orbit</a>
        <a href="#wallet" className="hover:text-white transition">Wallet</a>
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        {isConnected ? (
          <Link href="/home" className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-teal-100 transition">
            Launch app<ArrowRight size={15} /></Link>
        ) : (
          <button onClick={() => void connect()} disabled={isConnecting} title={error ?? undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-teal-100 transition disabled:opacity-90">
            {isConnecting ? "Connecting…" : "Connect BridgeKey"}</button>
        )}
      </div>
    </div>
  </header>;
}

/* ------------------------------ hero CTA ------------------------------- */
export function HeroCta() {
  const { isConnected, isConnecting, connect } = useWallet();
  if (isConnected) return <Link href="/home" className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-7 py-3 hover:bg-teal-100 transition">
    Start collecting<ArrowRight size={15} /></Link>;
  return <button onClick={() => void connect()} disabled={isConnecting}
    className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-7 py-3 hover:bg-teal-100 transition disabled:opacity-90">
    {isConnecting ? "Connecting…" : "Connect BridgeKey"}</button>;
}

/* ----------------------------- hero visual ----------------------------- */
function HeroPostCard() {
  const coin = coinById("cybermumbai");
  return <div className="card p-4 sm:p-5 shadow-2xl shadow-black/60">
    <div className="flex items-center gap-3">
      <Avatar name="Gajanan" />
      <div><div className="flex items-center gap-1.5 text-[15px] font-semibold">Gajanan<BadgeCheck size={15} className="text-teal-300" /></div>
        <div className="muted text-sm">@gajanan · 2h</div></div>
    </div>
    <p className="mt-3 text-[15px] leading-relaxed">My first creation on MST. Cyber Mumbai — edition of 100.</p>
    <div className="mt-3 h-40 rounded-xl border border-white/10 bg-[#0c0d10] relative overflow-hidden">
      <div className="absolute inset-0 landing-grid" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-5xl font-bold tracking-tighter text-white/[.14] select-none">मुंबई</span>
      </div>
      <div className="absolute bottom-2.5 right-3 rounded-full bg-black/60 border border-white/15 px-2.5 py-1 text-[11px]">1 / 100</div>
    </div>
    <div className="mt-3 flex items-center gap-5 muted text-sm">
      <span className="flex items-center gap-1.5 text-rose-400"><Heart size={17} fill="currentColor" />231</span>
      <span className="flex items-center gap-1.5"><MessageCircle size={17} />42</span>
      <span className="flex items-center gap-1.5"><Repeat2 size={17} />18</span>
    </div>
    <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[.03] border border-white/10 px-4 py-3">
      <div><div className="text-sm font-semibold">{coin.symbol}</div>
        <div className="text-sm muted">{fmtMst(coin.price)} MST <span className="tick-up">+{coin.change24h}%</span></div></div>
      <Badge tone="up">▲ 24h</Badge>
    </div>
  </div>;
}
function HeroChartCard() {
  const coin = coinById("gajanan");
  return <div className="card p-4 shadow-2xl shadow-black/60">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5"><Avatar name="Gajanan" size={34} />
        <div><div className="text-sm font-semibold">{coin.symbol}</div><div className="muted text-xs">{fmtMst(coin.price)} MST</div></div></div>
      <span className="tick-up text-sm font-medium">+{coin.change24h}%</span>
    </div>
    <div className="mt-2"><CoinChart spark={coin.spark} height={96} /></div>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <span className="rounded-full bg-white text-black text-center text-xs font-medium py-2">Buy</span>
      <span className="rounded-full border border-white/15 text-center text-xs py-2">Sell</span>
    </div>
  </div>;
}
function HeroOrbitCard() {
  return <div className="card p-4 shadow-2xl shadow-black/60">
    <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-teal-300" />Orbit</div>
    <div className="mt-2.5 ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-white/[.08] border border-white/10 px-3.5 py-2 text-[13px]">What should I price my first coin at?</div>
    <div className="mt-2 text-[13px] leading-relaxed muted"><span className="text-teal-300">Orbit</span> — Start at 0.05 MST and let collectors find the price. Low floats move faster…</div>
  </div>;
}
export function HeroVisual() {
  return <div className="relative mx-auto w-full max-w-[520px]">
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 h-64 w-[130%] rounded-full bg-teal-400/[.07] blur-3xl pointer-events-none" />
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ ...ease, delay: 0.25 }}
      className="relative z-10"><HeroPostCard /></motion.div>
    <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      className="absolute z-20 -right-2 sm:-right-10 -bottom-10 w-52 sm:w-64"><HeroChartCard /></motion.div>
    <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      className="absolute z-20 -left-2 sm:-left-10 -top-8 w-56 sm:w-64"><HeroOrbitCard /></motion.div>
  </div>;
}

/* -------------------------------- ticker ------------------------------- */
export function Ticker() {
  const row = [...coins].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  const doubled = [...row, ...row];
  return <div className="border-y border-white/[.06] bg-white/[.015] overflow-hidden">
    <div className="animate-ticker flex w-max items-center gap-8 px-4 py-3">
      {doubled.map((c, i) => <span key={c.id + i} className="flex items-center gap-2 text-sm whitespace-nowrap">
        <span className="font-medium">{c.symbol}</span>
        <span className="muted">{fmtMst(c.price)}</span>
        <span className={c.change24h >= 0 ? "tick-up" : "tick-down"}>{c.change24h >= 0 ? "+" : ""}{c.change24h}%</span>
      </span>)}
    </div>
  </div>;
}

/* -------------------------------- sections ----------------------------- */
const STEPS = [
  { icon: PenLine, title: "Create", body: "Publish a post, mint it as a post coin, or launch your creator coin. One flow, no contracts to touch." },
  { icon: Compass, title: "Discover", body: "A feed ranked by real collecting — not ads. Find creators before the crowd does." },
  { icon: Coins, title: "Collect", body: "Own numbered editions of the posts you love. Your collection lives in your wallet." },
  { icon: CandlestickChart, title: "Trade", body: "Every coin has a market. Buy early creators, sell into attention, track it all live." },
  { icon: WalletIcon, title: "Earn", body: "Creators earn from every collect and trade. No platform cut on attention." },
];
export function HowItWorks() {
  return <section id="how" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
    <Reveal><p className="text-teal-300 text-sm font-medium">How it works</p>
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Five steps. One loop.</h2>
      <p className="muted mt-3 max-w-xl">Echo turns posting into an economy. Each step feeds the next — and every coin settles on MST Blockchain.</p></Reveal>
    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {STEPS.map((s, i) => <Reveal key={s.title} delay={i * 0.07}>
        <div className="card card-hover p-5 h-full">
          <span className="h-10 w-10 rounded-xl bg-teal-300/10 border border-teal-300/25 flex items-center justify-center"><s.icon size={18} className="text-teal-300" /></span>
          <div className="muted text-xs mt-4">0{i + 1}</div>
          <div className="font-semibold mt-0.5">{s.title}</div>
          <p className="muted text-sm mt-1.5 leading-relaxed">{s.body}</p>
        </div>
      </Reveal>)}
    </div>
  </section>;
}

export function MarketsPreview() {
  const rows = [...coins].sort((a, b) => b.volume24h - a.volume24h).slice(0, 6);
  return <section id="markets" className="border-y border-white/[.06] bg-white/[.015] scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
      <Reveal>
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-teal-300 text-sm font-medium">Markets</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Every creator, priced live.</h2>
            <p className="muted mt-3 max-w-xl">Creator coins and post coins trade around the clock. Watch attention become a price.</p></div>
          <Link href="/markets" className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/15 px-5 py-2.5 text-sm hover:border-white/30 transition shrink-0">
            All markets<ArrowUpRight size={15} /></Link>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="card mt-8 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 px-5 py-3 text-xs muted border-b border-white/[.06]">
            <span>Coin</span><span className="text-right">Price</span><span className="text-right">24h</span><span className="text-right">Volume</span><span className="text-right">Holders</span>
          </div>
          {rows.map((c) => <Link key={c.id} href={`/coins/${c.id}`}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_.7fr_.8fr_.7fr] gap-2 items-center px-5 py-3.5 border-b border-white/[.04] last:border-0 hover:bg-white/[.02] transition">
            <span className="font-medium">{c.symbol}<span className="muted text-xs font-normal"> {c.name}</span></span>
            <span className="text-right">{fmtMst(c.price)} <span className="muted text-xs">MST</span></span>
            <span className={`hidden sm:block text-right text-sm ${c.change24h >= 0 ? "tick-up" : "tick-down"}`}>{c.change24h >= 0 ? "+" : ""}{c.change24h}%</span>
            <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.volume24h)}</span>
            <span className="hidden sm:block text-right muted text-sm">{fmtNum(c.holders)}</span>
          </Link>)}
        </div>
      </Reveal>
      <Link href="/markets" className="sm:hidden mt-4 flex items-center justify-center gap-1.5 rounded-full border border-white/15 py-2.5 text-sm">All markets<ArrowUpRight size={15} /></Link>
    </div>
  </section>;
}

export function OrbitTeaser() {
  return <section id="orbit" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28 scroll-mt-16">
    <div className="grid lg:grid-cols-2 gap-10 items-center">
      <Reveal>
        <p className="text-teal-300 text-sm font-medium">Orbit</p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">An AI that speaks onchain.</h2>
        <p className="muted mt-3 leading-relaxed">Orbit helps you price coins, draft posts, and read the market — right inside Echo. Ask it anything, or just talk.<br /><br />
          <Link href="/orbit" className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-5 py-2.5 hover:bg-teal-100 transition">Chat with Orbit<ArrowRight size={15} /></Link></p>
      </Reveal>
      <Reveal delay={0.12}>
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-teal-300" />Orbit</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-white/[.08] border border-white/10 px-4 py-2.5">Is $AIAGENT overbought?</div>
            <div className="rounded-2xl rounded-bl-md bg-white/[.03] border border-white/10 px-4 py-2.5 muted leading-relaxed"><span className="text-white">Up 42% on real volume, holders still growing.</span> Momentum is hot — size accordingly, and never chase green candles with rent money.</div>
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-white/[.08] border border-white/10 px-4 py-2.5">Draft my coin launch post</div>
            <div className="rounded-2xl rounded-bl-md bg-white/[.03] border border-white/10 px-4 py-2.5 muted leading-relaxed"><span className="text-white">Done — check the composer.</span> I kept it under 200 characters and left room for your art.</div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm muted">Message Orbit…<ArrowUpRight size={15} className="ml-auto" /></div>
        </div>
      </Reveal>
    </div>
  </section>;
}

export function WalletSection() {
  const items = [
    { title: "BridgeKey, one tap", body: "Connect the non-custodial BridgeKey wallet. Keys never touch Echo — every signature happens in your wallet." },
    { title: "Testnet, free to try", body: "Echo runs on MST Testnet. Grab free tMSTC from the faucet and trade with zero real money." },
    { title: "Everything verifiable", body: "Every transaction links straight to the MST explorer. No black boxes, no fake fills." },
  ];
  return <section id="wallet" className="border-t border-white/[.06] bg-white/[.015] scroll-mt-16">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
      <Reveal><p className="text-teal-300 text-sm font-medium">Wallet</p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Your keys. Your coins.</h2></Reveal>
      <div className="mt-10 grid sm:grid-cols-3 gap-3">
        {items.map((it, i) => <Reveal key={it.title} delay={i * 0.07}>
          <div className="p-5"><div className="font-semibold">{it.title}</div><p className="muted text-sm mt-1.5 leading-relaxed">{it.body}</p></div>
        </Reveal>)}
      </div>
      <Reveal delay={0.1}>
        <div className="card mt-6 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex-1"><div className="font-semibold text-lg">Try it with test funds.</div>
            <p className="muted text-sm mt-1">Install BridgeKey, connect, claim tMSTC from the faucet, collect your first edition.</p></div>
          <Link href="/wallet" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-6 py-3 hover:bg-teal-100 transition shrink-0">
            Open wallet<ArrowRight size={15} /></Link>
        </div>
      </Reveal>
    </div>
  </section>;
}

export function FinalCta() {
  return <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28 text-center">
    <Reveal>
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">Post it. Coin it.<br />Own it.</h2>
      <p className="muted mt-4 max-w-md mx-auto">Join Echo on MST Testnet. Your first collect is one click away.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/home" className="inline-flex items-center gap-1.5 rounded-full bg-white text-black text-sm font-medium px-7 py-3 hover:bg-teal-100 transition">Launch app<ArrowRight size={15} /></Link>
        <Link href="/home" className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-7 py-3 text-sm hover:border-white/30 transition">Create first</Link>
      </div>
    </Reveal>
  </section>;
}

export function LandingFooter() {
  return <footer className="border-t border-white/[.06]">
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div>
        <div className="text-lg"><Wordmark /></div>
        <p className="muted text-sm mt-2 max-w-xs leading-relaxed">A social network where posts become collectible coins on MST Blockchain.</p>
        <p className="text-xs mt-4 text-[#5b616b]">Testnet chain 91562037 · tMSTC has no monetary value.</p>
      </div>
      <div><div className="text-sm font-medium mb-3">Product</div>
        <div className="space-y-2.5 text-sm muted">
          <Link href="/home" className="block hover:text-white transition">Feed</Link>
          <Link href="/explore" className="block hover:text-white transition">Explore</Link>
          <Link href="/markets" className="block hover:text-white transition">Markets</Link>
          <Link href="/orbit" className="block hover:text-white transition">Orbit</Link>
        </div></div>
      <div><div className="text-sm font-medium mb-3">Create</div>
        <div className="space-y-2.5 text-sm muted">
          <Link href="/home" className="block hover:text-white transition">New post</Link>
          <Link href="/wallet" className="block hover:text-white transition">Wallet</Link>
        </div></div>
      <div><div className="text-sm font-medium mb-3">Network</div>
        <div className="space-y-2.5 text-sm muted">
          <a href="https://testnet.mstscan.com" target="_blank" rel="noreferrer" className="block hover:text-white transition">Explorer</a>
          <a href="https://faucet.mstblockchain.com" target="_blank" rel="noreferrer" className="block hover:text-white transition">Faucet</a>
          <a href="https://docs.mstblockchain.com" target="_blank" rel="noreferrer" className="block hover:text-white transition">MST docs</a>
        </div></div>
    </div>
    <div className="border-t border-white/[.06]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-col sm:flex-row gap-2 items-center justify-between text-xs text-[#5b616b]">
        <span>© 2026 Echo. Built on MST Blockchain.</span>
        <span>Non-custodial · Testnet preview</span>
      </div>
    </div>
  </footer>;
}
