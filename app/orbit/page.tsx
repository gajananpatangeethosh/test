"use client";
import { useState } from "react";
import { Sparkles, Plus } from "lucide-react";
import { AppShell } from "@/components/shell";
import OrbitChat from "@/components/orbit/chat-panel";
import { ORBIT_THREAD_KEY, LEGACY_THREAD_KEYS } from "@/lib/brand";

export default function OrbitPage() {
  // Bumping this key remounts the thread, which is how "New chat" clears it.
  const [seed, setSeed] = useState(0);
  const clear = () => {
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
        <button onClick={clear}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs hover:border-white/30">
          <Plus size={13} />New chat
        </button>
      </div>
      <OrbitChat key={seed} />
    </div>
  </AppShell>;
}
