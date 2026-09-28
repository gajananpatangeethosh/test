"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";
export function Button({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const v = (p as { variant?: string }).variant ?? "primary";
  const { variant: _v, ...rest } = p as Record<string, unknown>;
  return <button {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} className={cn(
    "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition active:scale-[.98] disabled:opacity-50",
    v === "primary" && "bg-[#e8eaed] text-black hover:bg-white px-5 py-2.5",
    v === "outline" && "border border-white/15 hover:border-white/30 px-5 py-2.5",
    v === "ghost" && "hover:bg-white/5 px-3 py-2",
    className)} />;
}
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.slice(0, 2).toUpperCase();
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0"
    style={{ width: size, height: size, fontSize: size * 0.34, background: `linear-gradient(135deg,#1d2b28,#14161a)`, border: "1px solid rgba(255,255,255,.12)", color: "#5eead4" }}>{initials}</div>;
}
export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "up" | "down" }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    tone === "neutral" && "bg-white/5 text-[#c8ccd2] border border-white/10",
    tone === "up" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    tone === "down" && "bg-red-500/10 text-red-400 border border-red-500/20")}>{children}</span>;
}
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (t: string) => void }) {
  return <div className="flex gap-1 rounded-full bg-white/[.04] border border-white/10 p-1 w-fit">
    {tabs.map((t) => <button key={t} onClick={() => onChange(t)}
      className={cn("rounded-full px-4 py-1.5 text-sm transition", value === t ? "bg-white text-black font-medium" : "text-[#9aa0ab] hover:text-white")}>{t}</button>)}
  </div>;
}
export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Portalled to <body>: an ancestor with `backdrop-filter`/`transform`/`filter`
  // (the topbar uses backdrop-blur) becomes the containing block for
  // `position: fixed`, which would trap this overlay inside the 56px header.
  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:p-6">
        <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
          className={cn("card relative my-auto w-full min-w-0", wide ? "max-w-lg" : "max-w-md",
            "max-h-[calc(100dvh-2rem)] overflow-y-auto overflow-x-hidden break-words rounded-2xl p-5 sm:p-6 shadow-2xl")}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
