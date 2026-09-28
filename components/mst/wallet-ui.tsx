"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Copy, Check, ExternalLink, LogOut, RefreshCw, AlertTriangle } from "lucide-react";
import { useWallet, shortAddress } from "./wallet-provider";
import { ACTIVE_NETWORK, getExplorerAddressUrl } from "@/lib/mst/config";
import { Modal, Button } from "../ui";
export function BalanceDisplay({ className = "" }: { className?: string }) {
  const { balance, balanceError, balanceLoading, refreshBalance, isConnected } = useWallet();
  if (!isConnected) return null;
  if (balanceLoading) return <span className={className + " muted text-sm"}>Loading balance…</span>;
  if (balanceError || balance === null)
    return <span className={className + " text-sm"}><span className="text-red-400">Unable to load balance</span>
      <button onClick={() => void refreshBalance()} className="ml-2 underline text-teal-300">Retry</button></span>;
  const n = Number(balance);
  return <span className={className}>{Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : balance} {ACTIVE_NETWORK.currencySymbol}</span>;
}
export function NetworkIndicator() {
  const { isConnected, isCorrectNetwork, chainId } = useWallet();
  if (!isConnected) return null;
  return <span className={`inline-flex items-center gap-1.5 text-xs ${isCorrectNetwork ? "text-emerald-400" : "text-amber-400"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${isCorrectNetwork ? "bg-emerald-400" : "bg-amber-400"}`} />
    {isCorrectNetwork ? ACTIVE_NETWORK.label : `Wrong network (${chainId})`}</span>;
}
export function NetworkSwitchButton() {
  const { isConnected, isCorrectNetwork, switchNetwork } = useWallet();
  if (!isConnected || isCorrectNetwork) return null;
  return <button onClick={() => void switchNetwork()}
    className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200 hover:border-amber-400/60">
    <AlertTriangle size={15} />Switch to {ACTIVE_NETWORK.label}</button>;
}
export function ExplorerLink({ hash, address, label }: { hash?: string; address?: string; label?: string }) {
  const base = ACTIVE_NETWORK.explorerUrl;
  if (!base) return null;
  const url = hash ? `${base.replace(/\/$/, "")}/tx/${hash}` : `${base.replace(/\/$/, "")}/address/${address}`;
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-300 hover:underline text-xs">
    {label ?? "View on MST Explorer"}<ExternalLink size={12} /></a>;
}
export function WalletButton() {
  const { address, isConnected, isConnecting, connect, disconnect, balance, balanceError, walletLabel, error, clearError } = useWallet();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [copied, setCopied] = useState(false);
  // Auto-close the modal once the wallet actually connects (stays open on error).
  useEffect(() => { if (isConnected) setModal(false); }, [isConnected]);
  if (!isConnected) return <>
    <button onClick={() => setModal(true)} className="rounded-full bg-white text-black text-sm font-medium px-5 py-2 hover:bg-teal-100">Connect BridgeKey</button>
    <Modal open={modal} onClose={() => { setModal(false); clearError(); }}>
      <div className="font-semibold text-lg">Connect BridgeKey</div>
      <p className="muted text-sm mt-1">Non-custodial sign-in. Echo never sees your keys or seed phrase — approval happens in your wallet.</p>
      <Button
        disabled={isConnecting}
        onClick={() => { clearError(); void connect(); }}
        className="w-full mt-4 disabled:opacity-90">
        {isConnecting ? "Connecting…" : error ? "Retry Connection" : "Connect BridgeKey"}</Button>
      {isConnecting && !error && <p className="text-sm text-teal-300 mt-3">Check the BridgeKey extension popup — unlock with your password and approve localhost.</p>}
      {error && <>
        <p className="text-sm text-red-400 mt-3">{error}</p>
        <ul className="muted text-xs mt-2 space-y-1 list-disc pl-4">
          <li>No wallet inside the extension yet? Open BridgeKey and create or import a wallet first.</li>
          <li>Unlocked? Enter your password in the extension popup and approve localhost.</li>
          <li>Extension allowed on this site (puzzle-piece → site access)?</li>
          <li>Still nothing? Reload the page and retry.</li>
        </ul>
      </>}
      <p className="muted text-[11px] mt-3">No wallet? Use any MST-compatible EVM wallet (e.g. MetaMask with the MST network) or get test funds at the MST faucet. See MST_SETUP.md.</p>
    </Modal>
  </>;
  return <div className="relative">
    <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/30">
      <span className="h-2 w-2 rounded-full bg-emerald-400" />{shortAddress(address)}</button>
    {open && <>
      {typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />, document.body)}
      <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] card p-4 space-y-3 break-words shadow-2xl">
        <div><div className="muted text-xs">{walletLabel}</div><div className="font-mono text-sm">{shortAddress(address)}</div></div>
        <div><div className="muted text-xs">Balance</div>
          <div className="font-semibold">{balanceError || balance === null ? "Unable to load balance" : `${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${ACTIVE_NETWORK.currencySymbol}`}</div></div>
        <div><div className="muted text-xs">Network</div><NetworkIndicator /></div>
        <NetworkSwitchButton />
        <div className="flex gap-2 pt-1">
          <button onClick={() => { void navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-white/15 py-2 text-xs hover:border-white/30">
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy Address"}</button>
          {getExplorerAddressUrl(address) && <a href={getExplorerAddressUrl(address)} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 rounded-full border border-white/15 py-2 text-xs hover:border-white/30">
            <ExternalLink size={13} />Explorer</a>}
        </div>
        <Link href="/wallet" onClick={() => setOpen(false)} className="block text-center rounded-full bg-white text-black py-2 text-sm font-medium">Open Wallet</Link>
        <button onClick={() => { void disconnect(); setOpen(false); }}
          className="w-full flex items-center justify-center gap-1.5 text-sm muted hover:text-white py-1"><LogOut size={14} />Disconnect</button>
      </div>
    </>}
  </div>;
}
export function TxErrorToast() {
  const { error, clearError } = useWallet();
  if (!error) return null;
  return <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] card px-4 py-3 flex items-center gap-3 text-sm w-max max-w-[92vw] break-words">
    <AlertTriangle size={16} className="text-amber-400 shrink-0" /><span className="min-w-0">{error}</span>
    <button onClick={clearError} className="muted hover:text-white ml-2">Dismiss</button>
  </div>;
}
export function RefreshBalanceButton() {
  const { refreshBalance, balanceLoading } = useWallet();
  return <button onClick={() => void refreshBalance()} className="muted hover:text-white"><RefreshCw size={14} className={balanceLoading ? "animate-spin" : ""} /></button>;
}
