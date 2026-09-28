"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ACTIVE_NETWORK, getExplorerAddressUrl } from "@/lib/mst/config";
import { getMSTBalance } from "@/lib/mst/client";
import {
  connectBridgeKey, disconnectWallet, isOnMstNetwork,
  subscribeWalletEvents, switchToMST, walletLabel,
} from "@/lib/mst/wallet";
import {
  requestProviderAnnouncements, resolveProvider, setActiveProvider, startDiscoveryListener,
} from "@/lib/mst/discovery";
import { MstError, toMstError } from "@/lib/mst/errors";
import type { TxRecord } from "@/lib/mst/types";
export type WalletContextValue = {
  address: string; isConnected: boolean; isConnecting: boolean; restoring: boolean;
  chainId: number | null; networkLabel: string; isCorrectNetwork: boolean;
  balance: string | null; balanceError: boolean; balanceLoading: boolean;
  walletLabel: string; error: string | null; txs: TxRecord[];
  connect: () => Promise<void>; disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>; switchNetwork: () => Promise<void>;
  addTx: (t: TxRecord) => void; clearError: () => void;
};
const Ctx = createContext<WalletContextValue | null>(null);
export const shortAddress = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export function MstWalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [label, setLabel] = useState("Wallet");
  const [error, setError] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRecord[]>([]);
  const addrRef = useRef(address);
  useEffect(() => { addrRef.current = address; }, [address]);
  const refreshBalance = useCallback(async () => {
    const a = addrRef.current; if (!a) return;
    setBalanceLoading(true); setBalanceError(false);
    try { setBalance(await getMSTBalance(a)); }
    catch { setBalance(null); setBalanceError(true); }
    finally { setBalanceLoading(false); }
  }, []);
  const connect = useCallback(async () => {
    setIsConnecting(true); setError(null);
    try {
      const r = await connectBridgeKey();
      setAddress(r.address); setChainId(r.chainId);
      setLabel(walletLabel(r.provider));
    } catch (e) { setError(toMstError(e).message); }
    finally { setIsConnecting(false); }
  }, []);
  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAddress(""); setChainId(null); setBalance(null); setBalanceError(false); setError(null);
  }, []);
  const switchNetwork = useCallback(async () => {
    setError(null);
    try { setChainId(await switchToMST()); }
    catch (e) { setError(toMstError(e).message); }
  }, []);
  const addTx = useCallback((t: TxRecord) => setTxs((p) => [t, ...p].slice(0, 20)), []);
  const clearError = useCallback(() => setError(null), []);
  // Silent reconnect + live account/network detection.
  // Starts EIP-6963 discovery immediately so late-injecting extensions
  // (announced after page load) are captured for the whole session.
  useEffect(() => {
    startDiscoveryListener();
    requestProviderAnnouncements();
    let unsub: () => void = () => undefined;
    let cancelled = false;
    (async () => {
      const p = await resolveProvider(2500); if (!p || cancelled) { if (!cancelled) setRestoring(false); return; }
      try {
        const accs = (await p.request({ method: "eth_accounts" })) as string[];
        if (accs?.[0] && !cancelled) {
          setActiveProvider(p);
          setAddress(accs[0]); setChainId(parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
          setLabel(walletLabel(p));
        }
      } catch { /* wallet locked — stay disconnected */ }
      if (!cancelled) setRestoring(false);
      if (!cancelled) unsub = subscribeWalletEvents({
        onAccounts: (a) => { if (a.length === 0) { void disconnect(); } else setAddress(a[0]); },
        onChain: (c) => setChainId(c),
      });
    })();
    return () => { cancelled = true; unsub(); };
  }, [disconnect]);
  useEffect(() => { if (address && chainId === ACTIVE_NETWORK.chainId) void refreshBalance(); }, [address, chainId, refreshBalance]);
  const value = useMemo<WalletContextValue>(() => ({
    address, isConnected: !!address, isConnecting, restoring, chainId,
    networkLabel: ACTIVE_NETWORK.label, isCorrectNetwork: isOnMstNetwork(chainId),
    balance, balanceError, balanceLoading, walletLabel: label, error, txs,
    connect, disconnect, refreshBalance, switchNetwork, addTx, clearError,
  }), [address, isConnecting, restoring, chainId, balance, balanceError, balanceLoading, label, error, txs, connect, disconnect, refreshBalance, switchNetwork, addTx, clearError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useWallet(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside MstWalletProvider");
  return v;
}
export { getExplorerAddressUrl, MstError };
