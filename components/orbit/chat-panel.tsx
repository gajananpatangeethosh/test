"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUp, Square, Sparkles, Copy, Check, Mic, ImagePlus,
  ArrowRightLeft, AlertTriangle, Download, ExternalLink, Loader2, ShieldAlert,
} from "lucide-react";
import { useWallet, shortAddress } from "@/components/mst/wallet-provider";
import { NetworkSwitchButton } from "@/components/mst/wallet-ui";
import { makeTxRecord, sendTransaction } from "@/lib/mst/transactions";
import { toMstError } from "@/lib/mst/errors";
import { ACTIVE_NETWORK, getExplorerTxUrl } from "@/lib/mst/config";
import type { TxStage } from "@/lib/mst/types";
import { cn } from "@/lib/utils";
import { orbitText } from "@/lib/orbit/text";
import { ORBIT_THREAD_KEY } from "@/lib/brand";
import {
  MAX_TRANSFER, REQUIRE_CONFIRM, checkBalance, checkTransfer, currency,
  type TransferDraft,
} from "@/lib/orbit/transfer";
import {
  PUTER_MODELS, PUTER_RATIOS, describePuterError, generateImage,
  signInPuter, signOutPuter, signedInUser,
  type PuterModel, type PuterRatio, type PuterUser,
} from "@/lib/orbit/puter";
import { openrouterImage, type ImageEngine } from "@/lib/orbit/image";
import {
  appendOrbitMessageAction,
  getOrbitConversationAction,
} from "@/app/actions/orbit";

// ── Thread model ─────────────────────────────────────────────────────────────
// One conversation holds all three capabilities. Text bubbles go to the LLM;
// image and transfer bubbles are local tool results that never enter the prompt.
type TextMsg = { kind: "text"; role: "user" | "assistant"; content: string };
type ImageMsg = {
  kind: "image"; id: string; prompt: string; src: string | null;
  caption: string; status: "loading" | "done" | "error"; error?: string;
};
type TxStatus = TxStage | "review";
type TxMsg = {
  kind: "tx"; id: string; to: string; amount: string; memo: string;
  status: TxStatus; hash?: string; error?: string; question?: string;
  source?: string; hint?: string; recipient?: string;
};
type Msg = TextMsg | ImageMsg | TxMsg;

const isText = (m: Msg): m is TextMsg => m.kind === "text";

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
const appendFinal = (acc: string, next: string) =>
  !acc || /\s$/.test(acc) || /^\s/.test(next) ? acc + next : acc + " " + next;

const SUGGESTIONS: Record<Mode, string[]> = {
  chat: [
    "Explain MST testnet in 3 lines",
    "What is a creator coin?",
    "Draft a post for my first coin",
    "How do I get testnet tMSTC?",
  ],
  post: [
    "a neon-lit night market in a rain-soaked cyberpunk alley, cinematic",
    "portrait of a golden retriever astronaut, studio lighting",
    "abstract 3d render of a glass coin floating over a dark grid",
  ],
  tx: [
    `Send 5 ${currency()} to alice`,
    `Send 12.5 ${currency()} to 0x2222222222222222222222222222222222222222 for a tip`,
  ],
};
const LS_KEY = ORBIT_THREAD_KEY;
const IS_TESTNET = ACTIVE_NETWORK.name === "testnet";

type Mode = "chat" | "post" | "tx";

const MODES: { id: Mode; label: string; icon: typeof Sparkles; placeholder: string }[] = [
  { id: "chat", label: "Chat", icon: Sparkles, placeholder: "Message Orbit…" },
  { id: "post", label: "Post", icon: ImagePlus, placeholder: "Describe the post image to generate…" },
  { id: "tx", label: "Send", icon: ArrowRightLeft, placeholder: `e.g. Send 5 ${currency()} to alice` },
];

const newId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function renderBody(text: string) {
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

export default function OrbitChat({ conversationId = null }: { conversationId?: string | null }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Server persistence is active when a conversation id is provided and the
  // history load succeeds. Otherwise this is the legacy local-only thread.
  const [serverThread, setServerThread] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [model, setModel] = useState<PuterModel>(PUTER_MODELS[0]);
  const [ratio, setRatio] = useState<PuterRatio>(PUTER_RATIOS[0]);
  // undefined = not checked yet, null = signed out, object = account on this page.
  const [puterUser, setPuterUser] = useState<PuterUser | undefined>(undefined);
  // Test mode returns a sample image and spends nothing, which is the only way to
  // tell "our wiring is broken" apart from "this account can't afford it".
  const [puterTest, setPuterTest] = useState(false);
  // OpenRouter runs on the app's own key, so it is the default: it works for
  // whoever is running the app without needing a Puter account.
  const [engine, setEngine] = useState<ImageEngine>("openrouter");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId, balance, refreshBalance } = useWallet();
  const cur = currency();

  // ── Voice input (Web Speech API) ──────────────────────────────────────────
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
      started = true; clearTimeout(watchdog); recRef.current = null; setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setVoiceError("Mic blocked — allow microphone access in the address bar, then tap the mic again.");
      else if (e.error === "no-speech") setVoiceError("Didn't catch that — tap the mic and speak again.");
      else if (e.error === "audio-capture") setVoiceError("No microphone found — plug one in and try again.");
      else if (e.error === "language-not-supported") setVoiceError(`Chrome's speech service doesn't support ${rec.lang}.`);
      else if (e.error !== "aborted") setVoiceError(`Mic error (${e.error}).`);
    };
    recRef.current = rec;
    try { rec.start(); } catch (err) {
      started = true; clearTimeout(watchdog); recRef.current = null; setListening(false);
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

  // History source of truth: server conversation when available, otherwise the
  // legacy localStorage thread. Image data URLs are megabytes and a transfer
  // bubble is a receipt, not conversation — only text persists either way.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let live = true;
    setHydrated(false); setServerThread(false);
    if (conversationId) {
      getOrbitConversationAction(conversationId).then((r) => {
        if (!live) return;
        if (r.ok) {
          setMsgs(r.messages.map((m) => ({ kind: "text", role: m.role, content: m.content }) as TextMsg));
          setServerThread(true);
        } else {
          loadLocal();
        }
        setHydrated(true);
      }).catch(() => { if (live) { loadLocal(); setHydrated(true); } });
      return () => { live = false; };
    }
    loadLocal();
    setHydrated(true);
    function loadLocal() {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
        if (Array.isArray(raw)) setMsgs(raw.filter((m): m is TextMsg => m?.kind === "text"));
      } catch { /* ignore */ }
    }
  }, [conversationId]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || serverThread) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(msgs.filter(isText).slice(-50))); } catch { /* ignore */ }
  }, [hydrated, msgs, serverThread]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  // Read which Puter account this page is on only when that engine is selected.
  // The default path never touches Puter, so a spent account cannot block it.
  useEffect(() => {
    if (mode !== "post" || engine !== "puter" || puterUser !== undefined) return;
    let live = true;
    signedInUser().then((u) => { if (live) setPuterUser(u); }).catch(() => { if (live) setPuterUser(null); });
    return () => { live = false; };
  }, [mode, engine, puterUser]);

  const doSignIn = async () => {
    try {
      setError("");
      setPuterUser(await signInPuter());
    } catch (e) { setError(describePuterError(e)); }
  };

  const doSignOut = () => {
    setError("");
    signOutPuter();
    setPuterUser(null);
  };

  // `status` is a union because it means different things per kind; everything
  // else here is a plain optional field present on one or both variants.
  type MsgPatch = Partial<{
    src: string | null; caption: string; error?: string; hash?: string;
    question?: string; source?: string; hint?: string;
    status: ImageMsg["status"] | TxStatus;
  }>;

  const patch = (id: string, next: MsgPatch) =>
    setMsgs((m) => m.map((x) => ("id" in x && x.id === id ? ({ ...x, ...next } as Msg) : x)));

  // ── Chat ──────────────────────────────────────────────────────────────────
  // Fire-and-forget server persistence. Failures stay silent so a signed-out
  // or unmigrated backend never breaks the chat itself.
  const persist = (role: "user" | "assistant", content: string, model?: string) => {
    if (!serverThread || !conversationId || !content.trim()) return;
    void appendOrbitMessageAction(conversationId, { role, content, model }).catch(() => undefined);
  };

  const sendChat = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError("");
    const next = [...msgs, { kind: "text", role: "user", content } as TextMsg];
    setMsgs(next); setInput(""); setBusy(true);
    persist("user", content);
    abort.current = new AbortController();
    let modelUsed: string | undefined;
    try {
      const res = await fetch("/api/orbit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter(isText) }),
        signal: abort.current.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
      }
      modelUsed = res.headers.get("X-Orbit-Model") ?? undefined;
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "", buf = "";
      setMsgs((m) => [...m, { kind: "text", role: "assistant", content: "" }]);
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
        setMsgs((m) => {
          const c = [...m];
          const last = c[c.length - 1];
          if (last?.kind === "text" && last.role === "assistant") c[c.length - 1] = { ...last, content: snapshot };
          return c;
        });
      }
      persist("assistant", acc, modelUsed);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMsgs((m) => {
          const last = m[m.length - 1];
          return last?.kind === "text" && last.role === "assistant" && last.content === "" ? m.slice(0, -1) : m;
        });
      } else setError((e as Error).message || "Something went wrong.");
    } finally { setBusy(false); abort.current = null; }
  };

  // ── Image ────────────────────────────────────────────────────────────────
  const sendImage = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setError(""); setInput(""); setBusy(true);
    const id = newId();
    setMsgs((m) => [
      ...m,
      { kind: "text", role: "user", content: p },
      { kind: "image", id, prompt: p, src: null, caption: "", status: "loading" } as ImageMsg,
    ]);
    persist("user", p);
    const captionFor = () => {
      void orbitText([{
        role: "user",
        content: `Write a short social caption (max 180 characters) for this image. No hashtags unless one fits naturally. No preamble — just the caption.\n\nImage prompt: ${p}`,
      }]).then((c) => c && patch(id, { caption: c })).catch(() => undefined);
    };
    const viaApp = async () => {
      const result = await openrouterImage(p, { aspectRatio: ratio.label });
      patch(id, { src: result.src, status: "done" });
      captionFor();
    };
    try {
      // Default engine never asks Puter. A spent or guest Puter session was
      // rejecting every prompt with insufficient_funds before this path ran.
      if (engine === "puter") {
        if (puterUser === null && !puterTest) {
          await viaApp();
          return;
        }
        try {
          const result = await generateImage(p, {
            provider: model.provider,
            model: model.id,
            ratio: { w: ratio.w, h: ratio.h },
            testMode: puterTest,
          });
          patch(id, { src: result.src, status: "done" });
          if (puterTest) patch(id, { caption: "Test mode — sample image, no credits spent." });
          else captionFor();
          return;
        } catch (e) {
          const described = describePuterError(e);
          const funds = described.includes("insufficient_funds") || described.includes("no credits");
          if (puterTest || !funds) {
            patch(id, { status: "error", error: described });
            return;
          }
          await viaApp();
          return;
        }
      }
      await viaApp();
    } catch (e) {
      const message = e instanceof Error ? e.message : describePuterError(e);
      patch(id, { status: "error", error: message || "Image generation failed. Try again." });
    } finally { setBusy(false); }
  };

  // ── Transfer ─────────────────────────────────────────────────────────────
  // The draft is passed in rather than looked up in `msgs`: on the direct-send
  // path this runs in the same tick the message was appended, so the closure
  // still holds the pre-append array and the lookup would miss.
  const runTx = async (id: string, draft: TransferDraft) => {
    setBusy(true);
    patch(id, { status: "preparing", error: undefined, hint: undefined });
    // The wallet owns this await, so we can't time it out or abort it. If the
    // prompt never surfaces, say so instead of sitting on "Check your wallet…".
    let nag: ReturnType<typeof setTimeout> | undefined;
    try {
      const check = checkTransfer(draft, address);
      if (!check.ok) throw new Error(check.error);
      const h = await sendTransaction(
        { to: check.to, value: check.value },
        {
          label: `Send ${check.amount} ${cur}`,
          onStage: (s) => {
            patch(id, { status: s });
            if (s === "awaiting-approval" && !nag) {
              nag = setTimeout(() => patch(id, {
                hint: "Still waiting on your wallet. If no prompt appeared, unlock it, check the "
                  + "MST Testnet tab is selected, then press Confirm again.",
              }), 20000);
            }
          },
        },
      );
      patch(id, { status: "confirmed", hash: h, hint: undefined });
      addTx(makeTxRecord({ hash: h, from: address, to: check.to, label: `Send ${check.amount} ${cur}`, chainId: chainId ?? 0 }));
      void refreshBalance();
    } catch (e) {
      patch(id, { status: "failed", error: toMstError(e).message, hint: undefined });
    } finally { if (nag) clearTimeout(nag); setBusy(false); }
  };

  const sendTx = async (text: string) => {
    const p = text.trim();
    if (!p || busy) return;
    setError(""); setInput(""); setBusy(true);
    const id = newId();
    setMsgs((m) => [...m, { kind: "text", role: "user", content: p }]);
    persist("user", p);
    try {
      const res = await fetch("/api/orbit/transfer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, from: address || null }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; draft: { to: string; amount: string; memo?: string }; source?: string; recipientName?: string }
        | { ok: false; question?: string; message?: string };

      if (data.ok !== true) {
        setMsgs((m) => [...m, {
          kind: "tx", id, to: "", amount: "", memo: "",
          status: "failed", question: data.question || data.message || "I couldn't read that as a transfer.",
        }]);
        return;
      }

      // Re-validate locally: never trust the response body to trigger a send.
      const local = checkTransfer(data.draft, address);
      if (!local.ok) {
        setMsgs((m) => [...m, {
          kind: "tx", id, to: data.draft.to, amount: data.draft.amount, memo: data.draft.memo ?? "",
          status: "failed", question: local.error, recipient: data.recipientName,
        }]);
        return;
      }

      const draft: TransferDraft = { to: local.to, amount: local.amount, memo: local.memo };
      setMsgs((m) => [...m, {
        kind: "tx", id,
        to: draft.to, amount: draft.amount, memo: draft.memo ?? "",
        status: REQUIRE_CONFIRM ? "review" : "preparing",
        source: data.source,
        recipient: data.recipientName,
      }]);

      if (REQUIRE_CONFIRM) { setBusy(false); return; }
      await runTx(id, draft);
    } catch (e) {
      setError((e as Error).message || "Couldn't reach Orbit's transfer parser.");
    } finally { setBusy(false); }
  };

  const submit = (text: string) => {
    if (mode === "post") return sendImage(text);
    if (mode === "tx") return sendTx(text);
    return sendChat(text);
  };

  const downloadImage = (src: string) => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `echo-orbit-${newId()}.png`;
    a.click();
  };

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const active = MODES.find((m) => m.id === mode)!;
  const canSubmit = input.trim() && !busy;

  return <>
    <div className="flex-1 min-h-0 overflow-y-auto">
      {msgs.length === 0 && !busy && (
        <div className="h-full flex flex-col items-center justify-center text-center pb-10">
          <span className="h-14 w-14 rounded-2xl bg-teal-300/10 border border-teal-300/25 flex items-center justify-center">
            {mode === "post" ? <ImagePlus size={24} className="text-teal-300" />
              : mode === "tx" ? <ArrowRightLeft size={24} className="text-teal-300" />
              : <Sparkles size={24} className="text-teal-300" />}
          </span>
          <h1 className="text-2xl font-bold mt-4">
            {mode === "post" ? "Generate an image" : mode === "tx" ? "Send by prompt" : "Ask Orbit anything"}
          </h1>
          <p className="muted text-sm mt-1 max-w-xs">
            {mode === "post" ? "Describe it. Puter draws it, Orbit captions it."
              : mode === "tx" ? "Describe the transfer, then approve it in your wallet."
              : "Your guide to Echo, MST Blockchain and creator coins."}
          </p>
          {mode === "tx" && (
            <p className="max-w-sm mt-3 text-[11px] leading-relaxed muted flex items-start gap-1.5 text-left">
              <ShieldAlert size={13} className="shrink-0 mt-px" />
              Orbit reads your sentence and your wallet asks you to sign. A display name is matched to
              that person's profile. The address and amount are never invented.
              {IS_TESTNET && <> Running on <strong>{ACTIVE_NETWORK.label}</strong>.</>}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-md">
            {SUGGESTIONS[mode].map((s) => (
              <button key={s} onClick={() => void submit(s)}
                className="rounded-full border border-white/12 px-4 py-2 text-[13px] muted hover:text-white hover:border-teal-300/40 transition max-w-full">
                <span className="line-clamp-1">{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5 max-w-2xl mx-auto">
        {msgs.map((m, i) => {
          if (m.kind === "text" && m.role === "user")
            return <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[.08] border border-white/10 px-4 py-2.5 text-[15px] whitespace-pre-wrap break-words">{m.content}</div>
            </div>;

          if (m.kind === "text")
            return <div key={i} className="group flex gap-3">
              <span className="h-7 w-7 shrink-0 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center mt-0.5"><Sparkles size={13} className="text-teal-300" /></span>
              <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
                {m.content ? renderBody(m.content) : (
                  <span className="inline-flex items-center gap-2 py-2 muted text-sm">Thinking…{[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 rounded-full bg-teal-300/70 animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}</span>
                )}
                {m.content && (
                  <button onClick={() => copy(m.content, `t${i}`)}
                    className="mt-1.5 flex items-center gap-1 text-xs muted hover:text-white opacity-0 group-hover:opacity-100 transition">
                    {copied === `t${i}` ? <Check size={12} /> : <Copy size={12} />}{copied === `t${i}` ? "Copied" : "Copy"}
                  </button>
                )}
              </div>
            </div>;

          if (m.kind === "image")
            return <div key={i} className="group flex gap-3">
              <span className="h-7 w-7 shrink-0 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center mt-0.5"><ImagePlus size={13} className="text-teal-300" /></span>
              <div className="min-w-0 flex-1 space-y-2">
                {m.status === "loading" && (
                  <div className="rounded-xl border border-white/10 bg-white/[.03] aspect-square max-w-sm flex items-center justify-center">
                    <span className="inline-flex items-center gap-2 muted text-sm"><Loader2 size={15} className="animate-spin" />Drawing…</span>
                  </div>
                )}
                {m.status === "error" && (
                  <p className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 break-words">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />{m.error}
                  </p>
                )}
                {m.status === "done" && m.src && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.src} alt={m.prompt} className="w-full max-w-sm rounded-xl border border-white/10" />
                    {m.caption
                      ? <p className="text-[15px] leading-relaxed break-words">{m.caption}</p>
                      : <span className="inline-flex items-center gap-2 text-xs muted"><Loader2 size={12} className="animate-spin" />Writing a caption…</span>}
                    <div className="flex gap-2">
                      <button onClick={() => downloadImage(m.src!)}
                        className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs muted hover:text-white transition">
                        <Download size={12} />Download
                      </button>
                      {m.caption && (
                        <button onClick={() => copy(m.caption, `c${i}`)}
                          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs muted hover:text-white transition">
                          {copied === `c${i}` ? <Check size={12} /> : <Copy size={12} />}{copied === `c${i}` ? "Copied" : "Copy caption"}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] muted">Drawn in your browser via Puter. Not uploaded — add a backend to publish these.</p>
                  </>
                )}
              </div>
            </div>;

          // Transfer bubble. Doubles as the review card when REQUIRE_CONFIRM is on.
          const t = m as TxMsg;
          const shortTo = t.to ? `${t.to.slice(0, 6)}…${t.to.slice(-4)}` : "";
          const aff = t.to ? checkBalance(t, balance) : null;
          return <div key={i} className="flex gap-3">
            <span className="h-7 w-7 shrink-0 rounded-full bg-teal-300/10 border border-teal-300/30 flex items-center justify-center mt-0.5"><ArrowRightLeft size={13} className="text-teal-300" /></span>
            <div className="min-w-0 flex-1">
              {t.question
                ? <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-[15px] break-words">{t.question}</p>
                : <div className={cn("rounded-2xl border p-3.5 space-y-2",
                    t.status === "failed" ? "border-red-500/30 bg-red-500/[.07]"
                      : t.status === "confirmed" ? "border-emerald-400/30 bg-emerald-400/[.07]" : "border-white/12 bg-white/[.03]")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold">{t.amount} {cur}</span>
                    <button onClick={() => t.to && copy(t.to, `a${i}`)}
                      className="text-right shrink-0 hover:text-white transition" title="Copy recipient address">
                      {t.recipient && <div className="text-[13px] font-medium text-white">{t.recipient}</div>}
                      <div className="font-mono text-[11px] muted">{shortTo}</div>
                    </button>
                  </div>
                  <div className="text-[11px] muted leading-relaxed">
                    from {shortAddress(address || "—")} · {ACTIVE_NETWORK.label}
                    {t.recipient && " · display name from your message"}
                    {t.source === "verbatim" && " · taken verbatim from your message"}
                  </div>
                  {t.error && <p className="text-[13px] text-red-300 break-words">{t.error}</p>}
                  {aff && t.status === "review" && <p className="text-[13px] text-red-300 break-words">{aff}</p>}
                  {t.hash && <div className="font-mono text-[11px] break-all muted">{t.hash}</div>}
                  {t.status === "review" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!isConnected && (
                        <button onClick={() => void connect()}
                          className="rounded-full bg-white text-black px-4 py-1.5 text-xs font-medium">Connect wallet</button>
                      )}
                      {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}
                      <button onClick={() => void runTx(t.id, { to: t.to, amount: t.amount, memo: t.memo })}
                        disabled={!!aff || !isConnected || !isCorrectNetwork}
                        className="rounded-full bg-teal-300 text-black px-4 py-1.5 text-xs font-medium disabled:opacity-40">
                        Confirm &amp; sign
                      </button>
                    </div>
                  )}
                  {t.status === "preparing" && <p className="text-xs muted">Check your wallet…</p>}
                  {t.status === "awaiting-approval" && <p className="text-xs muted">Approve the transaction in your wallet.</p>}
                  {t.hint && <p className="text-[12px] text-amber-200/90 break-words">{t.hint}</p>}
                  {t.status === "failed" && t.to.startsWith("0x") && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!isConnected && (
                        <button onClick={() => void connect()}
                          className="rounded-full bg-white text-black px-4 py-1.5 text-xs font-medium">Connect wallet</button>
                      )}
                      {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}
                      <button onClick={() => void runTx(t.id, { to: t.to, amount: t.amount, memo: t.memo })}
                        disabled={!isConnected || !isCorrectNetwork}
                        className="rounded-full bg-teal-300 text-black px-4 py-1.5 text-xs font-medium disabled:opacity-40">
                        Try again
                      </button>
                    </div>
                  )}
                  {t.status === "broadcasting" && <p className="text-xs muted">Broadcasting…</p>}
                  {t.status === "confirming" && <p className="inline-flex items-center gap-1.5 text-xs muted"><Loader2 size={12} className="animate-spin" />Confirming on {ACTIVE_NETWORK.label}…</p>}
                  {t.status === "confirmed" && getExplorerTxUrl(t.hash!) && (
                    <a href={getExplorerTxUrl(t.hash!)} target="_blank" rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-[12px] text-teal-300 hover:underline">
                      View in explorer <ExternalLink size={11} />
                    </a>
                  )}
                </div>}
            </div>
          </div>;
        })}
        {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 break-words">{error}</p>}
        <div ref={bottom} />
      </div>
    </div>

    <div className="max-w-2xl mx-auto w-full pt-3">
      <div className={cn(
        "group/composer relative rounded-[22px] border bg-white/[.04] transition-all duration-200",
        "border-white/12 focus-within:border-teal-300/50 focus-within:bg-white/[.06] focus-within:shadow-[0_0_0_4px_rgba(45,212,191,0.07)]",
        listening && "border-red-500/40 bg-red-500/[.04] focus-within:border-red-500/60",
        mode === "tx" && "border-amber-400/25 focus-within:border-amber-300/50 focus-within:shadow-[0_0_0_4px_rgba(251,191,36,0.07)]",
      )}>
        {mode === "post" && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            <div className="flex gap-1">
              <button onClick={() => setEngine("openrouter")} title="Generate without a Puter account"
                className={cn("rounded-full border px-2.5 py-1 text-[11px] transition",
                  engine === "openrouter" ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:text-white")}>
                Included
              </button>
              <button onClick={() => setEngine("puter")} title="Bill your own Puter account"
                className={cn("rounded-full border px-2.5 py-1 text-[11px] transition",
                  engine === "puter" ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:text-white")}>
                Puter
              </button>
            </div>
            {engine === "puter" && (
              <select value={model.id} onChange={(e) => setModel(PUTER_MODELS.find((m) => m.id === e.target.value) ?? PUTER_MODELS[0])}
                className="rounded-full bg-white/[.06] border border-white/10 px-2.5 py-1 text-[11px] outline-none">
                {PUTER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.hint}</option>)}
              </select>
            )}
            {(engine !== "puter" || !model.fixedSize) && (
              <div className="flex gap-1">
                {PUTER_RATIOS.map((r) => (
                  <button key={r.id} onClick={() => setRatio(r)}
                    className={cn("rounded-full border px-2.5 py-1 text-[11px] transition",
                      ratio.id === r.id ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:text-white")}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            {engine === "puter" && (
            <button onClick={() => setPuterTest((v) => !v)} title="Generate a free sample image without spending credits"
              className={cn("rounded-full border px-2.5 py-1 text-[11px] transition",
                puterTest ? "border-sky-300/50 bg-sky-300/10 text-sky-200" : "border-white/10 muted hover:text-white")}>
              {puterTest ? "Test mode on" : "Test mode"}
            </button>
            )}
            {engine === "puter" && (
            <div className="ml-auto flex items-center gap-1">
              {puterUser === undefined ? (
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] muted">checking Puter…</span>
              ) : puterUser ? (
                <>
                  <button onClick={() => void doSignIn()} title="Switch Puter account"
                    className={cn("rounded-full border px-2.5 py-1 text-[11px] transition",
                      puterUser.is_temp
                        ? "border-amber-300/50 bg-amber-300/10 text-amber-200 hover:bg-amber-300/20"
                        : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20")}>
                    {puterUser.username ?? "signed in"}
                    {puterUser.is_temp ? " (temporary)" : ""}
                  </button>
                  <button onClick={doSignOut} title="Sign out of Puter on this page"
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] muted transition hover:border-white/25 hover:text-white">
                    Sign out
                  </button>
                </>
              ) : (
                <button onClick={() => void doSignIn()}
                  className="rounded-full border border-white/15 bg-white px-2.5 py-1 text-[11px] font-medium text-black hover:bg-white/90">
                  Sign in with Puter
                </button>
              )}
            </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-1 pl-4 pr-2 py-2">
          <textarea ref={boxRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(input); } }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }}
            placeholder={listening ? "Listening… speak now" : active.placeholder}
            className="flex-1 bg-transparent text-[15px] leading-relaxed outline-none resize-none placeholder:text-[#5b616b] max-h-[140px] py-1.5 caret-teal-300" />
          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            <button onClick={toggleMic} disabled={busy || voiceOK === false} aria-label={listening ? "Stop listening" : "Voice input"
              } aria-pressed={listening} title={voiceOK === false ? "Voice not supported in this browser" : listening ? "Stop listening" : "Speak to Orbit"}
              className={cn("relative h-9 w-9 rounded-full flex items-center justify-center transition",
                listening ? "bg-red-500 text-white" : "text-[#c8ccd2] hover:bg-white/[.08] hover:text-white",
                "disabled:opacity-40 disabled:hover:bg-transparent")}>
              {listening && <span className="absolute inset-0 rounded-full border border-red-400/60 animate-ping" />}
              <Mic size={16} className="relative" />
            </button>
            {busy
              ? <button onClick={() => abort.current?.abort()} aria-label="Stop generating" disabled={mode !== "chat"}
                className="h-9 w-9 rounded-full bg-white text-black flex items-center justify-center transition hover:bg-teal-100 active:scale-95 disabled:opacity-30">
                <Square size={14} />
              </button>
              : <button onClick={() => void submit(input)} disabled={!canSubmit} aria-label="Send"
                className={cn("h-9 w-9 rounded-full flex items-center justify-center transition active:scale-95 disabled:opacity-30",
                  mode === "tx" ? "bg-amber-300 text-black hover:bg-amber-200" : "bg-teal-300 text-black hover:bg-teal-200")}>
                <ArrowUp size={16} />
              </button>}
          </div>
        </div>

        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-0.5 flex-wrap">
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = m.id === mode;
            return <button key={m.id} onClick={() => setMode(m.id)} aria-pressed={on}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition",
                on
                  ? m.id === "tx" ? "border-amber-300/50 bg-amber-300/10 text-white" : "border-teal-300/50 bg-teal-300/10 text-white"
                  : "border-white/10 muted hover:text-white hover:border-white/25")}>
              <Icon size={12} />{m.label}
            </button>;
          })}
          <span className="ml-auto text-[10px] muted hidden sm:block">
            {mode === "tx"
              ? `limit ${MAX_TRANSFER} ${cur} · approve in wallet`
              : mode === "post"
                ? engine === "puter" ? "billed to your Puter account" : "included · no Puter credits"
                : "Enter to send · Shift+Enter for a new line"}
          </span>
        </div>
      </div>

      <div className="mt-1.5 h-4 px-1 text-[11px]">
        {voiceError ? <p className="text-red-400 truncate">{voiceError}</p>
          : listening ? <p className="text-red-400 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />Listening… tap the mic to stop</p>
            : null}
      </div>
    </div>
  </>;
}
