"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Square, Sparkles, Copy, Check, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: { isFinal: boolean; [k: number]: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  onstart: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

function getVoiceCtor() {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRec) | undefined;
}
const getVoiceSupport = () => !!getVoiceCtor();
const getServerVoiceSupport = () => true;
const subscribeVoiceSupport = () => () => {};
// Finals arrive as separate utterances, so they need an explicit separator.
const appendFinal = (acc: string, next: string) =>
  !acc || /\s$/.test(acc) || /^\s/.test(next) ? acc + next : acc + " " + next;

const SUGGESTIONS = [
  "Explain MST testnet in 3 lines",
  "What is a creator coin?",
  "Draft a post for my first coin",
  "How do I get testnet tMSTC?",
];
const LS_KEY = "mstora-orbit-thread";

function renderBody(text: string) {
  // Lightweight markdown: ```code``` blocks + paragraphs. No extra deps.
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const nl = part.indexOf("\n");
      const code = nl >= 0 ? part.slice(nl + 1) : part;
      return <pre key={i} className="mt-2 overflow-x-auto rounded-xl bg-black/50 border border-white/10 p-3 text-[13px] font-mono whitespace-pre">{code.replace(/\n$/, "")}</pre>;
    }
    return part.split(/\n{2,}/).map((para, j) => (
      <p key={`${i}-${j}`} className="whitespace-pre-wrap break-words [&:not(:first-child)]:mt-2">{para}</p>
    ));
  });
}

export function ChatPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  // --- Voice input (Web Speech API: free, on-device where supported, Chrome/Edge) ---
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const voiceOK = useSyncExternalStore(subscribeVoiceSupport, getVoiceSupport, getServerVoiceSupport);
  const recRef = useRef<SpeechRec | null>(null);
  const finalRef = useRef("");
  const toggleMic = () => {
    if (listening) {
      setVoiceError("");
      try { recRef.current?.stop(); } catch { /* already stopped */ }
      return;
    }
    const Ctor = getVoiceCtor();
    if (!Ctor) { setVoiceError("Voice input isn't supported in this browser — try Chrome or Edge."); return; }
    setVoiceError("");
    finalRef.current = input ? input.replace(/\s$/, "") + " " : "";
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let started = false;
    const watchdog = setTimeout(() => {
      if (started || recRef.current !== rec) return;
      recRef.current = null;
      try { rec.abort(); } catch { /* ignore */ }
      setListening(false);
      setVoiceError("The microphone never started. Check that this tab is on https (or localhost) and the mic isn't held by another app.");
    }, 5000);
    rec.onstart = () => { started = true; clearTimeout(watchdog); setListening(true); };
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript ?? "";
        if (r.isFinal) finalRef.current = appendFinal(finalRef.current, t);
        else interim += t;
      }
      setInput((finalRef.current + interim).trimStart());
    };
    rec.onend = () => { clearTimeout(watchdog); recRef.current = null; setListening(false); };
    rec.onerror = (e) => {
      started = true;
      clearTimeout(watchdog);
      recRef.current = null;
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setVoiceError("Mic blocked — allow microphone access in the address bar, then tap the mic again.");
      else if (e.error === "no-speech") setVoiceError("Didn't catch that — tap the mic and speak again.");
      else if (e.error === "audio-capture") setVoiceError("No microphone found — plug one in and try again.");
      else if (e.error === "language-not-supported") setVoiceError(`Chrome's speech service doesn't support ${rec.lang}.`);
      else if (e.error !== "aborted") setVoiceError(`Mic error (${e.error}).`);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      started = true;
      clearTimeout(watchdog);
      recRef.current = null;
      setListening(false);
      setVoiceError("Couldn't start the microphone — check browser permissions and try again.");
      console.error("SpeechRecognition.start() failed", err);
    }
  };
  useEffect(() => {
    const el = boxRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }
  }, [input]);
  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) { try { rec.abort(); } catch { /* ignore */ } }
  }, []);
  useEffect(() => {
    const onReset = () => {
      abort.current?.abort();
      setMsgs([]); setError("");
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);
  // Thread is restored after mount — reading localStorage in the state
  // initializer would make the client's first render differ from the server's.
  // This is a genuine post-mount browser read (the one case an effect exists
  // for); the cascading-render heuristic doesn't apply to a one-shot restore.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { setMsgs(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); } catch { /* ignore */ }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (!hydrated) return; try { localStorage.setItem(LS_KEY, JSON.stringify(msgs.slice(-50))); } catch { /* ignore */ } }, [hydrated, msgs]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError("");
    const next = [...msgs, { role: "user", content } as Msg];
    setMsgs(next); setInput(""); setBusy(true);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/orbit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: abort.current.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "", buf = "";
      setMsgs((m) => [...m, { role: "assistant", content: "" }]);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") break;
          try {
            const d = JSON.parse(payload)?.choices?.[0]?.delta as { content?: string; reasoning?: string; reasoning_content?: string } | undefined;
            // Reasoning models emit `reasoning` long before `content`; showing it
            // stops the assistant bubble from sitting on empty dots for a minute.
            const delta = d?.content || d?.reasoning || d?.reasoning_content;
            if (delta) acc += delta;
          } catch { /* partial chunk — skip */ }
        }
        const snapshot = acc;
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: snapshot }; return c; });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMsgs((m) => (m.length && m[m.length - 1].content === "" ? m.slice(0, -1) : m));
      } else setError((e as Error).message || "Something went wrong.");
    } finally { setBusy(false); abort.current = null; }
  };

  return <>
    <div className="flex-1 min-h-0 overflow-y-auto">
      {msgs.length === 0 && !busy && (
        <div className="h-full flex flex-col items-center justify-center text-center pb-10">
          <span className="h-14 w-14 rounded-2xl bg-teal-300/10 border border-teal-300/25 flex items-center justify-center"><Sparkles size={24} className="text-teal-300" /></span>
          <h1 className="text-2xl font-bold mt-4">Ask Orbit anything</h1>
          <p className="muted text-sm mt-1 max-w-xs">Your guide to MSTORA, MST Blockchain and creator coins.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-md">
            {SUGGESTIONS.map((s) => <button key={s} onClick={() => void send(s)}
              className="rounded-full border border-white/12 px-4 py-2 text-[13px] muted hover:text-white hover:border-teal-300/40 transition">{s}</button>)}
          </div>
        </div>
      )}
      <div className="space-y-5 max-w-2xl mx-auto">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[.08] border border-white/10 px-4 py-2.5 text-[15px] whitespace-pre-wrap break-words">{m.content}</div></div>
        ) : (
          <div key={i} className="group flex gap-3">
            <span className="h-7 w-7 shrink-0 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center mt-0.5"><Sparkles size={13} className="text-teal-300" /></span>
            <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
              {m.content ? renderBody(m.content) : <span className="inline-flex items-center gap-2 py-2 muted text-sm">Thinking…{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 rounded-full bg-teal-300/70 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}</span>}
              {m.content && <button onClick={() => { void navigator.clipboard.writeText(m.content); setCopied(i); setTimeout(() => setCopied(-1), 1500); }}
                className="mt-1.5 flex items-center gap-1 text-xs muted hover:text-white opacity-0 group-hover:opacity-100 transition">
                {copied === i ? <Check size={12} /> : <Copy size={12} />}{copied === i ? "Copied" : "Copy"}</button>}
            </div>
          </div>
        ))}
        {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 break-words">{error}</p>}
        <div ref={bottom} />
      </div>
    </div>

    <div className="max-w-2xl mx-auto w-full pt-3">
      <div className={cn(
        "group/composer relative flex items-end gap-1 rounded-[22px] border bg-white/[.04] pl-4 pr-2 py-2 transition-all duration-200",
        "border-white/12 focus-within:border-teal-300/50 focus-within:bg-white/[.06] focus-within:shadow-[0_0_0_4px_rgba(45,212,191,0.07)]",
        listening && "border-red-500/40 bg-red-500/[.04] focus-within:border-red-500/60"
      )}>
        <textarea ref={boxRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }}
          placeholder={listening ? "Listening… speak now" : "Message Orbit…"}
          className="flex-1 bg-transparent text-[15px] leading-relaxed outline-none resize-none placeholder:text-[#5b616b] max-h-[140px] py-1.5 caret-teal-300" />
        <div className="flex items-center gap-1 shrink-0 pb-0.5">
          <button onClick={toggleMic} disabled={busy || voiceOK === false} aria-label={listening ? "Stop listening" : "Voice input"}
            aria-pressed={listening} title={voiceOK === false ? "Voice not supported in this browser" : listening ? "Stop listening" : "Speak to Orbit"}
            className={cn("relative h-9 w-9 rounded-full flex items-center justify-center transition",
              listening ? "bg-red-500 text-white" : "text-[#c8ccd2] hover:bg-white/[.08] hover:text-white",
              "disabled:opacity-40 disabled:hover:bg-transparent")}>
            {listening && <span className="absolute inset-0 rounded-full border border-red-400/60 animate-ping" />}
            <Mic size={16} className="relative" />
          </button>
          {busy
            ? <button onClick={() => abort.current?.abort()} aria-label="Stop generating"
              className="h-9 w-9 rounded-full bg-white text-black flex items-center justify-center transition hover:bg-teal-100 active:scale-95"><Square size={14} /></button>
            : <button onClick={() => void send(input)} disabled={!input.trim()} aria-label="Send message"
              className="h-9 w-9 rounded-full bg-teal-300 text-black flex items-center justify-center transition hover:bg-teal-200 active:scale-95 disabled:opacity-30 disabled:hover:bg-teal-300">
              <ArrowUp size={16} /></button>}
        </div>
      </div>
      <div className="mt-2 h-4 px-1 flex items-center justify-between gap-3 text-[11px]">
        {voiceError
          ? <p className="text-red-400 truncate">{voiceError}</p>
          : listening
            ? <p className="text-red-400 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />Listening… tap the mic to stop</p>
            : <span />}
        <p className="muted shrink-0 hidden sm:block">
          <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift</kbd> + <kbd className="font-sans">Enter</kbd> for a new line
        </p>
      </div>
    </div>
  </>;
}

const RESET_EVENT = "mstora:orbit-reset";

/** Called by the page header so the reset stays inside the panel's own state. */
export const resetOrbitChat = () => window.dispatchEvent(new Event(RESET_EVENT));
