"use client";
import { useState } from "react";
import { ArrowRight, Loader2, Send, ShieldAlert, Sparkles, X, Check, Copy, ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { useWallet, shortAddress } from "@/components/mst/wallet-provider";
import { NetworkSwitchButton } from "@/components/mst/wallet-ui";
import { TransactionStatus } from "@/components/mst/tx-status";
import { toMstError } from "@/lib/mst/errors";
import { makeTxRecord, sendTransaction } from "@/lib/mst/transactions";
import { ACTIVE_NETWORK, getExplorerTxUrl } from "@/lib/mst/config";
import { MAX_TRANSFER, checkBalance, checkTransfer, currency, type TransferDraft } from "@/lib/orbit/transfer";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "send 5 MST to 0x1111111111111111111111111111111111111111",
  "transfer 12.5 tMSTC to 0x2222222222222222222222222222222222222222 for a tip",
];

const IS_TESTNET = ACTIVE_NETWORK.name === "testnet";

export function TxPanel() {
  const { isConnected, isCorrectNetwork, connect, addTx, address, chainId, balance, refreshBalance } = useWallet();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const [question, setQuestion] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<"idle" | "running" | "done">("idle");
  const [txStage, setTxStage] = useState<Parameters<typeof TransactionStatus>[0]["stage"]>("idle");
  const [hash, setHash] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const cur = currency();
  const check = draft ? checkTransfer(draft, address) : null;
  const insufficient = draft ? checkBalance(draft, balance) : null;
  const canSend = !!check?.ok && !insufficient && isConnected && isCorrectNetwork && stage !== "running";

  const reset = () => {
    setDraft(null); setQuestion(""); setError(""); setPrompt("");
    setStage("idle"); setTxStage("idle"); setHash(""); setTxError(null);
  };

  const parse = async () => {
    const text = prompt.trim();
    if (!text || parsing) return;
    setParsing(true); setError(""); setQuestion(""); setDraft(null);
    try {
      const res = await fetch("/api/orbit/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `from` is sent only so the server can reject obvious self-sends early.
        // The signer is chosen from the wallet at execution time, never from here.
        body: JSON.stringify({ prompt: text, from: address || null }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { ok: true; draft: TransferDraft }
        | { ok: false; question?: string; message?: string };

      if (data.ok === true) {
        // Re-validate locally: never trust the response body to render a confirm.
        const local = checkTransfer(data.draft, address);
        if (!local.ok) { setQuestion(local.error); return; }
        setDraft(data.draft);
      } else {
        setQuestion(data.question || data.message || "I couldn't read that as a transfer.");
      }
    } catch (e) { setError((e as Error).message || "Couldn't reach Orbit's transfer parser."); }
    finally { setParsing(false); }
  };

  const execute = async () => {
    if (!check?.ok || !canSend) return;
    setStage("running"); setTxError(null); setHash("");
    setTxStage("preparing");
    try {
      const h = await sendTransaction(
        { to: check.to, value: check.value },
        { label: `Send ${check.amount} ${cur}`, onStage: (s) => setTxStage(s) },
      );
      setHash(h); setStage("done");
      addTx(makeTxRecord({
        hash: h, from: address, to: check.to,
        label: `Send ${check.amount} ${cur}`, chainId: chainId ?? 0,
      }));
      // Keep the wallet balance honest right after a confirmed send.
      void refreshBalance();
    } catch (e) {
      const m = toMstError(e);
      setTxError(m.message);
      setTxStage("failed");
      setStage("idle");
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  };

  return <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="max-w-2xl mx-auto pb-10 space-y-5">
      <div>
        <h1 className="text-xl font-bold">Send by prompt</h1>
        <p className="muted text-sm mt-1">Describe the transfer. Orbit fills in the details — you approve every field before anything is signed.</p>
      </div>

      <div className={cn("flex items-start gap-2.5 rounded-2xl border p-3.5 text-[13px] leading-relaxed",
        IS_TESTNET ? "border-amber-400/30 bg-amber-400/[.07] text-amber-200" : "border-red-500/40 bg-red-500/10 text-red-300")}>
        <ShieldAlert size={17} className="shrink-0 mt-0.5" />
        <p>
          <strong className="font-semibold">Orbit cannot move money.</strong> It only reads your sentence into a
          proposal. Funds always leave from your connected wallet, and only after you review the amount, the
          recipient and the network — then you sign in your own wallet.
          {IS_TESTNET && <> This build targets <strong>{ACTIVE_NETWORK.label}</strong> ({cur}).</>}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 space-y-3">
        <label className="block text-sm muted" htmlFor="orbit-tx-prompt">What do you want to send?</label>
        <textarea id="orbit-tx-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void parse(); } }}
          placeholder={`Send 5 ${cur} to 0x…`}
          className="w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#5b616b] resize-y" />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} onClick={() => setPrompt(x)}
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] muted hover:text-white hover:border-teal-300/40 transition">
              {x}
            </button>
          ))}
        </div>
        <Button onClick={() => void parse()} disabled={!prompt.trim() || parsing} className="w-full">
          {parsing ? <><Loader2 size={15} className="animate-spin" />Reading…</> : <><Sparkles size={15} />Build the transfer</>}
        </Button>
        <p className="text-[11px] muted text-center">Orbit refuses anything it can&apos;t read as one exact address and one exact amount.</p>
      </div>

      {question && (
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <div className="text-sm font-medium flex items-center gap-2"><Sparkles size={14} className="text-teal-300" />Orbit needs a detail</div>
          <p className="text-sm muted mt-1.5 break-words">{question}</p>
        </div>
      )}

      {error && <p className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 break-words">{error}</p>}

      {draft && (
        <div className="rounded-2xl border border-teal-300/30 bg-teal-300/[.05] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <span className="h-6 w-6 rounded-full bg-teal-300/15 flex items-center justify-center"><Check size={13} className="text-teal-300" /></span>
            <span className="text-sm font-medium">Review before signing</span>
            <button onClick={reset} aria-label="Discard proposal"
              className="ml-auto text-muted hover:text-white transition"><X size={15} /></button>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] muted mb-0.5">From (your wallet)</div>
                <div className="font-mono text-[13px] flex items-center gap-1.5">
                  <span className="truncate">{shortAddress(address || "—")}</span>
                  {address && <button onClick={() => copy(address)} aria-label="Copy your address" className="shrink-0 text-muted hover:text-white">
                    {copied === address ? <Check size={12} className="text-teal-300" /> : <Copy size={12} />}
                  </button>}
                </div>
              </div>
              <ArrowRight size={16} className="shrink-0 muted" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] muted mb-0.5">To (recipient)</div>
                <div className="font-mono text-[13px] flex items-center gap-1.5">
                  <span className="truncate">{shortAddress(draft.to)}</span>
                  <button onClick={() => copy(draft.to)} aria-label="Copy recipient address" className="shrink-0 text-muted hover:text-white">
                    {copied === draft.to ? <Check size={12} className="text-teal-300" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] muted" htmlFor="tx-amount">Amount</label>
                <div className="flex items-center gap-2">
                  <input id="tx-amount" value={draft.amount} inputMode="decimal" disabled={stage === "running"}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                    className="w-24 text-right rounded-lg bg-white/[.06] border border-white/10 px-2.5 py-1.5 font-mono text-sm outline-none focus:border-teal-300/50 disabled:opacity-50" />
                  <span className="text-sm muted">{cur}</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] muted" htmlFor="tx-to">Recipient address</label>
                <input id="tx-to" value={draft.to} spellCheck={false} disabled={stage === "running"}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  className="w-full sm:w-80 rounded-lg bg-white/[.06] border border-white/10 px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-teal-300/50 disabled:opacity-50" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-[11px] muted shrink-0" htmlFor="tx-memo">Note (off-chain)</label>
                <input id="tx-memo" value={draft.memo ?? ""} disabled={stage === "running"} maxLength={140}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                  className="w-full sm:w-80 rounded-lg bg-white/[.06] border border-white/10 px-2.5 py-1.5 text-[12px] outline-none focus:border-teal-300/50 disabled:opacity-50" />
              </div>
              <p className="text-[10px] muted leading-snug">Fields are editable — always compare the full recipient address before signing. A transfer can&apos;t be reversed.</p>
            </div>

            <div className="flex items-center justify-between text-[11px] muted">
              <span>Network: {ACTIVE_NETWORK.label}</span>
              <span>Limit {MAX_TRANSFER} {cur} per transfer</span>
            </div>

            {balance !== null && (
              <p className="text-[11px] muted">Your balance: {balance} {cur}</p>
            )}

            {(check && !check.ok) && <p className="rounded-lg border border-red-500/25 bg-red-500/10 p-2.5 text-[13px] text-red-300 break-words">{check.error}</p>}
            {insufficient && <p className="rounded-lg border border-red-500/25 bg-red-500/10 p-2.5 text-[13px] text-red-300 break-words">{insufficient}</p>}

            {!isConnected && (
              <Button onClick={() => void connect()} className="w-full"><Wallet size={15} />Connect wallet</Button>
            )}
            {isConnected && !isCorrectNetwork && <NetworkSwitchButton />}

            <Button onClick={() => void execute()} disabled={!canSend}
              className={cn("w-full", !canSend && "opacity-50")}>
              {stage === "running"
                ? <><Loader2 size={15} className="animate-spin" />Waiting for your wallet…</>
                : <><Send size={15} />Confirm {check?.ok ? `${check.amount} ${cur}` : "transfer"}</>}
            </Button>
            <p className="text-[11px] muted text-center leading-relaxed">
              This opens {ACTIVE_NETWORK.label} in your wallet for review. MSTORA never holds keys and never signs for you.
            </p>
          </div>
        </div>
      )}

      {stage === "done" && hash && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[.07] p-4 space-y-2">
          <div className="text-sm font-medium text-emerald-300">Transfer confirmed on {ACTIVE_NETWORK.label}</div>
          <div className="font-mono text-[12px] break-all muted">{hash}</div>
          {getExplorerTxUrl(hash) && (
            <a href={getExplorerTxUrl(hash)} target="_blank" rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[12px] text-teal-300 hover:underline">
              View in explorer <ExternalLink size={12} />
            </a>
          )}
          <button onClick={reset} className="block text-[12px] muted hover:text-white transition">Send another</button>
        </div>
      )}

      {txStage !== "idle" && stage !== "done" && (
        <TransactionStatus stage={txStage} hash={hash} error={txError} onClose={() => { setTxStage("idle"); setTxError(null); }} title="Send" />
      )}
    </div>
  </div>;
}
