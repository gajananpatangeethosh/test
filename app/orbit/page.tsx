"use client";
import { useEffect, useState } from "react";
import { Sparkles, Plus } from "lucide-react";
import { AppShell } from "@/components/shell";
import OrbitChat from "@/components/orbit/chat-panel";
import { ORBIT_THREAD_KEY, LEGACY_THREAD_KEYS } from "@/lib/brand";
import {
  createOrbitConversationAction,
  listOrbitConversationsAction,
} from "@/app/actions/orbit";
import type { OrbitConversation } from "@/lib/db/types";

export default function OrbitPage() {
  const [conversations, setConversations] = useState<OrbitConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [serverOk, setServerOk] = useState(false);
  // Legacy single-thread remount, used only when server history is unavailable.
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    let live = true;
    listOrbitConversationsAction().then((r) => {
      if (!live) return;
      if (r.ok) {
        setServerOk(true);
        setConversations(r.conversations);
        if (r.conversations.length > 0) setActiveId(r.conversations[0].id);
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const refreshList = async () => {
    const r = await listOrbitConversationsAction().catch(() => null);
    if (r?.ok) {
      setServerOk(true);
      setConversations(r.conversations);
      return r.conversations;
    }
    return null;
  };

  const clear = async () => {
    // Server history: "New chat" starts a fresh conversation, history is kept.
    if (serverOk || activeId) {
      const r = await createOrbitConversationAction().catch(() => null);
      if (r?.ok) {
        setActiveId(r.conversation.id);
        void refreshList();
        return;
      }
    }
    // Fallback: legacy local-only thread.
    for (const k of [ORBIT_THREAD_KEY, ...LEGACY_THREAD_KEYS]) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
    setSeed((s) => s + 1);
  };

  return <AppShell>
    <div className="flex flex-col h-[calc(100dvh-3.5rem-2rem)] md:h-[calc(100dvh-3.5rem-2.5rem)] px-3 sm:px-0 py-4">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="h-8 w-8 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center"><Sparkles size={16} className="text-teal-300" /></span>
        <div><div className="font-bold leading-none">Orbit</div>
          <div className="muted text-xs mt-0.5">Echo&apos;s AI companion</div></div>
        <button onClick={() => void clear()}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs hover:border-white/30">
          <Plus size={13} />New chat
        </button>
      </div>
      {serverOk && conversations.length > 1 && (
        <div className="flex gap-1.5 px-1 pb-3 overflow-x-auto">
          {conversations.slice(0, 8).map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={c.id === activeId
                ? "shrink-0 rounded-full bg-white text-black px-3 py-1 text-[11px] font-medium max-w-44 truncate"
                : "shrink-0 rounded-full border border-white/10 px-3 py-1 text-[11px] muted hover:text-white max-w-44 truncate"}>
              {c.title || "Untitled chat"}
            </button>
          ))}
        </div>
      )}
      <OrbitChat key={activeId ?? `local-${seed}`} conversationId={activeId} />
    </div>
  </AppShell>;
}
