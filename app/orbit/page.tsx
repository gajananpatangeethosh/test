"use client";
import { useState } from "react";
import { MessageSquare, ImagePlus, Send, Sparkles, Plus } from "lucide-react";
import { AppShell } from "@/components/shell";
import { ChatPanel, resetOrbitChat } from "@/components/orbit/chat-panel";
import { PostPanel } from "@/components/orbit/post-panel";
import { TxPanel } from "@/components/orbit/tx-panel";
import { cn } from "@/lib/utils";

type Mode = "chat" | "post" | "tx";

const MODES: { id: Mode; label: string; icon: typeof MessageSquare; blurb: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, blurb: "Ask anything" },
  { id: "post", label: "Post", icon: ImagePlus, blurb: "Generate an image" },
  { id: "tx", label: "Transaction", icon: Send, blurb: "Send by prompt" },
];

export default function OrbitPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const active = MODES.find((m) => m.id === mode)!;

  return <AppShell>
    <div className="flex flex-col h-[calc(100dvh-3.5rem-2rem)] md:h-[calc(100dvh-3.5rem-2.5rem)] px-3 sm:px-0 py-4">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="h-8 w-8 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center"><Sparkles size={16} className="text-teal-300" /></span>
        <div><div className="font-bold leading-none">Orbit</div>
          <div className="muted text-xs mt-0.5">MSTORA&apos;s AI companion</div></div>
        {mode === "chat" && (
          <button onClick={resetOrbitChat}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs hover:border-white/30">
            <Plus size={13} />New chat
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 px-1 pb-3" role="tablist" aria-label="Orbit mode">
        {MODES.map((m) => {
          const Icon = m.icon;
          const on = m.id === mode;
          return <button key={m.id} role="tab" aria-selected={on} onClick={() => setMode(m.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition",
              on ? "border-teal-300/50 bg-teal-300/10 text-white" : "border-white/10 muted hover:text-white hover:border-white/25")}>
            <Icon size={14} />{m.label}
          </button>;
        })}
        <span className="ml-auto hidden sm:block text-[11px] muted truncate pl-2">{active.blurb}</span>
      </div>

      {mode === "chat" ? <ChatPanel /> : mode === "post" ? <PostPanel /> : <TxPanel />}
    </div>
  </AppShell>;
}
