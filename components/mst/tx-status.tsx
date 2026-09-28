"use client";
import { Check, Loader2, X } from "lucide-react";
import { Modal, Button } from "../ui";
import { ExplorerLink } from "./wallet-ui";
import type { TxStage } from "@/lib/mst/types";
const ORDER: TxStage[] = ["preparing", "awaiting-approval", "broadcasting", "confirming", "confirmed"];
const LABELS: Record<string, string> = {
  preparing: "Preparing", "awaiting-approval": "Awaiting BridgeKey Approval",
  broadcasting: "Broadcasting", confirming: "Confirming", confirmed: "Confirmed",
};
export function TransactionStatus({ stage, hash, error, onClose, title }: {
  stage: TxStage; hash: string; error: string | null; onClose: () => void; title: string;
}) {
  if (stage === "idle") return null;
  const st: string = stage;
  const idx = ORDER.indexOf(st === "failed" ? "confirming" : (st as TxStage));
  return <Modal open onClose={onClose}>
    <div className="font-semibold text-lg">{title}</div>
    {st === "awaiting-approval" && <p className="muted text-sm mt-1">BridgeKey will ask you to approve this transaction. <b className="text-white">Confirm in BridgeKey.</b></p>}
    <div className="mt-4 space-y-3">{ORDER.map((s, i) => {
      const done = st === "confirmed" || i < idx;
      const cur = s === st && st !== "confirmed";
      const failed = st === "failed";
      return <div key={s} className="flex items-center gap-3 text-sm">
        <span className={`h-7 w-7 rounded-full flex items-center justify-center border ${done ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : cur ? "border-teal-300/50 text-teal-200" : "border-white/10 text-[#6b7280]"}`}>
          {done ? <Check size={15} /> : cur ? <Loader2 size={15} className="animate-spin" /> : <span className="text-xs">{i + 1}</span>}</span>
        <span className={done || cur ? "text-white" : "muted"}>{LABELS[s]}</span>
      </div>;
    })}</div>
    {st === "failed" && error && <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 flex gap-2"><X size={15} className="shrink-0 mt-0.5" />{error}</div>}
    {hash && <div className="mt-4 space-y-1.5">
      <div className="text-xs muted break-all">Transaction submitted · <span className="font-mono">{hash}</span></div>
      <ExplorerLink hash={hash} label="View Transaction ↗" /></div>}
    {(st === "confirmed" || st === "failed") && <Button onClick={onClose} className="w-full mt-4">{st === "confirmed" ? "Done" : "Close"}</Button>}
  </Modal>;
}
