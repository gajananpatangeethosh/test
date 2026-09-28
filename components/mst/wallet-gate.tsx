"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Wallet } from "lucide-react";
import { useWallet, shortAddress } from "./wallet-provider";
import { Button } from "../ui";
import { Wordmark } from "../wordmark";
import { APP_NAME } from "@/lib/brand";
import { ACTIVE_NETWORK } from "@/lib/mst/config";

const PUBLIC_ROUTES = ["/"];

/**
 * Application gate: the app stays hidden until a wallet is connected.
 * Public marketing routes (the landing page) always render, so a
 * disconnected visitor lands on `/` and connects from there.
 * `restoring` covers the silent-reconnect probe so returning users are not
 * flashed the connect screen while `eth_accounts` is still in flight.
 */
export function WalletGate({ children }: { children: React.ReactNode }) {
  const { isConnected, isConnecting, restoring, connect, error, clearError, address, balance } = useWallet();
  const path = usePathname();
  if (isConnected || PUBLIC_ROUTES.includes(path)) return <>{children}</>;
  return <GateScreen
    isConnecting={isConnecting} restoring={restoring} error={error} clearError={clearError}
    connect={() => void connect()} address={address} balance={balance} />;
}

function GateScreen({ isConnecting, restoring, error, clearError, connect, address, balance }: {
  isConnecting: boolean; restoring: boolean; error: string | null; clearError: () => void;
  connect: () => void; address: string; balance: string | null;
}) {
  const [slow, setSlow] = useState(false);
  // A free-tier model can queue for a while; say so instead of showing a dead spinner.
  useEffect(() => {
    if (!isConnecting) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [isConnecting]);

  if (restoring) return <Splash>
    <Loader2 size={22} className="animate-spin text-teal-300" />
    <div className="font-semibold">Checking your wallet…</div>
    <p className="muted text-sm text-center max-w-sm">Looking for an already-approved BridgeKey session. This takes a second.</p>
  </Splash>;

  return <Splash>
    <span className="h-14 w-14 rounded-2xl bg-teal-300/10 border border-teal-300/25 flex items-center justify-center">
      <Wallet size={24} className="text-teal-300" />
    </span>
    <h1 className="text-2xl font-bold text-center">Connect your wallet</h1>
    <p className="muted text-sm text-center max-w-sm">
      {APP_NAME} is a wallet-gated app — every creator, coin, post and trade needs an address.
      Connect BridgeKey (or any MST-compatible EVM wallet) to continue.
    </p>

    <Button disabled={isConnecting} onClick={() => { clearError(); setSlow(false); connect(); }} className="w-full max-w-sm disabled:opacity-90">
      {isConnecting ? "Connecting…" : error ? "Retry Connection" : "Connect BridgeKey"}
    </Button>

    {isConnecting && !error && <>
      <p className="text-sm text-teal-300 text-center">Check the BridgeKey extension popup — unlock it and approve this site.</p>
      {slow && <p className="muted text-xs text-center max-w-sm">
        Still waiting on the model. Free OpenRouter models can queue — if nothing happens, reload and retry.
      </p>}
    </>}

    {error && <div className="w-full max-w-md space-y-2">
      <p className="text-sm text-red-400 text-center">{error}</p>
      <ul className="muted text-xs space-y-1 list-disc pl-4">
        <li>No wallet inside the extension yet? Open BridgeKey and create or import a wallet first.</li>
        <li>Unlocked? Enter your password in the extension popup and approve this site.</li>
        <li>Extension allowed here (puzzle-piece → site access)?</li>
        <li>Still nothing? Reload the page and retry.</li>
      </ul>
    </div>}

    {address === "" && <p className="muted text-[11px] text-center max-w-md">
      No wallet? Use any MST-compatible EVM wallet (e.g. MetaMask with the {ACTIVE_NETWORK.label} network) or get test funds at the MST faucet.
      {APP_NAME} never sees your keys or seed phrase.
    </p>}
    {balance !== null && <p className="muted text-[11px] text-center font-mono">{shortAddress(address)}</p>}
  </Splash>;
}

function Splash({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#08090b] flex flex-col items-center justify-center px-5 py-10 relative">
    <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(45,212,191,.10),transparent_70%)]" />
    <div className="relative flex flex-col items-center gap-5 w-full max-w-md">
      <div className="text-xl"><Wordmark /></div>
      {children}
    </div>
  </div>;
}
