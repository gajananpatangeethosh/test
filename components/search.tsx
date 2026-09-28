"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search as SearchIcon, User, Coins, Image as ImageIcon, CornerDownLeft, X } from "lucide-react";
import { Avatar, Badge, Modal } from "./ui";
import { search, parseQuery, toHits, highlight, type SearchHit, type SearchResults } from "@/lib/search";
import type { Coin, Creator, Post } from "@/lib/data";
import { cn, fmtMst, fmtNum, timeAgo } from "@/lib/utils";

const MAX_PER_GROUP = 5;
const GROUPS = [
  { key: "creators", label: "Profiles", icon: User },
  { key: "coins", label: "Coins", icon: Coins },
  { key: "posts", label: "Posts", icon: ImageIcon },
] as const;

type Group = (typeof GROUPS)[number]["key"];

const JUMPS: { href: string; label: string; hint: string }[] = [
  { href: "/explore", label: "Explore", hint: "Browse everything" },
  { href: "/markets", label: "Markets", hint: "Gainers, volume, new coins" },
  { href: "/orbit", label: "Orbit", hint: "Ask the AI companion" },
  { href: "/create", label: "Create", hint: "Mint a creator or post coin" },
  { href: "/wallet", label: "Wallet", hint: "Balance and activity" },
];

function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  return <>{highlight(text, tokens).map((p, i) => p.hit
    ? <mark key={i} className="bg-teal-300/20 text-teal-200 rounded px-0.5">{p.t}</mark>
    : <span key={i}>{p.t}</span>)}</>;
}

function Row({ hit, tokens, active, onHover, onPick }: {
  hit: SearchHit; tokens: string[]; active: boolean; onHover: () => void; onPick: () => void;
}) {
  const base = "w-full flex items-center gap-3 px-3 py-2 text-left transition";
  const ring = active ? "bg-white/[.08]" : "hover:bg-white/[.04]";

  if (hit.kind === "creator") {
    const c: Creator = hit.creator;
    return <button className={cn(base, ring)} onMouseEnter={onHover} onClick={onPick}>
      <Avatar name={c.name} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate"><Marked text={c.name} tokens={tokens} /></span>
        <span className="block text-xs muted truncate">@{c.username} · {fmtNum(c.followers)} followers</span>
      </span>
      <Badge>Profile</Badge>
    </button>;
  }

  if (hit.kind === "coin") {
    const k: Coin = hit.coin;
    const up = k.change24h >= 0;
    return <button className={cn(base, ring)} onMouseEnter={onHover} onClick={onPick}>
      <Avatar name={k.name} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium truncate"><Marked text={k.symbol} tokens={tokens} /></span>
        <span className="block text-xs muted truncate">{k.name} · @{k.creator}</span>
      </span>
      <span className="text-right shrink-0">
        <span className="block text-xs">{fmtMst(k.price)} MST</span>
        <span className={cn("block text-[11px]", up ? "tick-up" : "tick-down")}>{up ? "+" : ""}{k.change24h}%</span>
      </span>
    </button>;
  }

  const p: Post = hit.post;
  return <button className={cn(base, ring)} onMouseEnter={onHover} onClick={onPick}>
    {p.image
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover border border-white/10" loading="lazy" />
      : <span className="h-9 w-9 shrink-0 rounded-lg border border-white/10 bg-white/[.04] flex items-center justify-center"><ImageIcon size={14} className="muted" /></span>}
    <span className="min-w-0 flex-1">
      <span className="block text-sm truncate"><Marked text={p.caption} tokens={tokens} /></span>
      <span className="block text-xs muted truncate">@{p.creator} · {timeAgo(p.time)} · {fmtNum(p.collects)} collects</span>
    </span>
  </button>;
}

function ResultList({ results, tokens, active, setActive, onPick, footer }: {
  results: SearchResults; tokens: string[]; active: number; setActive: (n: number) => void;
  onPick: (h: SearchHit) => void; footer?: React.ReactNode;
}) {
  // `flat` is the keyboard cursor order; index into it while rendering groups.
  const flat = toHits(results);
  const bounds = new Map<Group, [number, number]>();
  let cursor = 0;
  for (const g of GROUPS) {
    const n = results[g.key].length;
    bounds.set(g.key, [cursor, cursor + n]);
    cursor += n;
  }
  return <div className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain py-1">
    {GROUPS.map(({ key, label, icon: Icon }) => {
      const n = results[key].length;
      if (n === 0) return null;
      const [start] = bounds.get(key)!;
      return <div key={key} className="mb-1 last:mb-0">
        <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide muted">
          <Icon size={11} />{label}<span className="text-white/30">{n}</span>
        </div>
        {results[key].map((_, i) => {
          const index = start + i;
          const hit = flat[index];
          return <Row key={hit.key} hit={hit} tokens={tokens} active={index === active}
            onHover={() => setActive(index)} onPick={() => onPick(hit)} />;
        })}
      </div>;
    })}
    {footer}
  </div>;
}

function QuickJumps({ onPick, footer }: { onPick: (href: string) => void; footer?: React.ReactNode }) {
  return <div className="max-h-[min(60dvh,24rem)] overflow-y-auto py-1">
    <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide muted">Jump to</div>
    {JUMPS.map((j) => <button key={j.href} onClick={() => onPick(j.href)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-white/[.05] transition">
      <span className="text-sm flex-1">{j.label}</span>
      <span className="text-xs muted">{j.hint}</span>
    </button>)}
    {footer}
  </div>;
}

function Empty({ q }: { q: string }) {
  return <div className="px-4 py-8 text-center">
    <div className="text-sm">No matches for <span className="text-white font-medium">{q}</span></div>
    <p className="muted text-xs mt-1.5">
      Try a handle like <span className="text-teal-300">@anaya</span>, a ticker like <span className="text-teal-300">$AIAGENT</span>, or words from a caption.
    </p>
  </div>;
}

function HintBar({ count }: { count: number }) {
  return <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2 text-[11px] muted">
    <CornerDownLeft size={11} />
    <span>Enter to open</span>
    <span className="text-white/25">·</span>
    <span>↑↓ to move</span>
    <span className="ml-auto">{count > 0 ? `${count} result${count === 1 ? "" : "s"}` : "Esc to close"}</span>
  </div>;
}

/** Inline topbar search + ⌘K palette, sharing one query so they never disagree. */
export function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(q, MAX_PER_GROUP), [q]);
  const tokens = useMemo(() => parseQuery(q), [q]);
  const flat = useMemo(() => toHits(results), [results]);

  // Cursor resets belong to the input handler, not an effect on `q`.
  const onQuery = (v: string) => { setQ(v); setActive(0); setOpen(true); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDialog((d) => !d);
        return;
      }
      if (e.key === "Escape") { setDialog(false); setOpen(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = useCallback((href: string) => { setOpen(false); setDialog(false); setQ(""); router.push(href); }, [router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const h = flat[active]; if (h) go(h.href); }
  };

  const body = (footer: React.ReactNode) => q.trim().length === 0
    ? <QuickJumps onPick={go} footer={footer} />
    : results.total === 0
      ? <Empty q={q} />
      : <ResultList results={results} tokens={tokens} active={active} setActive={setActive} onPick={(h) => go(h.href)} footer={footer} />;

  return <>
    <div className="flex items-center gap-2">
      <div ref={wrap} className="relative flex-1 sm:max-w-md">
        <div className={cn("flex items-center gap-2 rounded-full border bg-white/[.05] px-4 py-2 text-sm muted transition",
          open ? "border-teal-300/50" : "border-white/10")}>
          <SearchIcon size={16} className="shrink-0" />
          <input ref={input} value={q} onChange={(e) => onQuery(e.target.value)}
            onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
            placeholder="Search creators, coins, posts" aria-label="Search creators, coins, posts"
            className="bg-transparent outline-none w-full placeholder:text-[#6b7280] text-white" />
          {q
            ? <button onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Clear search" className="hover:text-white shrink-0"><X size={14} /></button>
            : <kbd className="hidden lg:inline shrink-0 text-[10px] border border-white/15 rounded px-1.5 py-0.5 text-white/50">⌘K</kbd>}
        </div>
        {open && <div className="absolute left-0 right-0 top-full mt-2 z-50 card p-1 shadow-2xl">{body(<HintBar count={results.total} />)}</div>}
      </div>
      <button onClick={() => setDialog(true)} aria-label="Search"
        className="sm:hidden flex items-center justify-center rounded-full border border-white/15 p-2 hover:border-white/30">
        <SearchIcon size={16} />
      </button>
    </div>

    <Modal open={dialog} onClose={() => setDialog(false)}>
      <div className="flex items-center gap-2 pb-3 border-b border-white/10">
        <SearchIcon size={17} className="text-teal-300 shrink-0" />
        <input autoFocus value={q} onChange={(e) => onQuery(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Search creators, coins, posts" aria-label="Search"
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[#6b7280] text-white" />
        <button onClick={() => setDialog(false)} className="muted hover:text-white shrink-0" aria-label="Close search"><X size={16} /></button>
      </div>
      {body(<HintBar count={results.total} />)}
    </Modal>
  </>;
}
