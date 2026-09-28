// Injected-wallet layer (BridgeKey / any MST-compatible EVM wallet).
// Discovery order: EIP-6963 BridgeKey announcement → window.ethereum →
// wallet-namespace globals → any EIP-6963 provider (see ./discovery.ts).
// Speaks standard EIP-1193 only (eth_requestAccounts, eth_chainId,
// wallet_switchEthereumChain, wallet_addEthereumChain).
// NEVER requests, handles, or stores private keys / seed phrases — signing
// always happens inside the wallet app.
import { ACTIVE_NETWORK } from "./config";
import { MstError } from "./errors";
import {
  getInjectedProviderSync, resolveProvider, setActiveProvider, providerLabel,
} from "./discovery";
import type { Eip1193Provider } from "./types";

/** Synchronous best-effort lookup (no waiting for late injection). */
export function getInjectedProvider(): Eip1193Provider | null {
  return getInjectedProviderSync();
}

export const isWalletAvailable = () => getInjectedProviderSync() !== null;
export function walletLabel(p: Eip1193Provider | null): string {
  return providerLabel(p);
}

const NOT_DETECTED = "BridgeKey extension not detected. Make sure it is installed, enabled for this site and unlocked — then press Retry.";
const CONNECT_REJECTED = "Connection request rejected in your wallet. Press Connect again to retry.";

/** Rejection shapes wallets use instead of EIP-1193 code 4001. */
function isRejection(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 4001 || code === "4001") return true;
  const msg = String((err as { message?: unknown })?.message ?? "").toLowerCase();
  return msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the connection")
    || msg.includes("rejected the request") || msg.includes("rejected by user");
}

// Single-flight: a second eth_requestAccounts while one is in flight makes the
// extension answer "already pending"/rejected, so callers share one attempt.
let connectInFlight: Promise<{ address: string; chainId: number; provider: Eip1193Provider }> | null = null;

export function connectBridgeKey(): Promise<{ address: string; chainId: number; provider: Eip1193Provider }> {
  if (connectInFlight) return connectInFlight;
  connectInFlight = requestAccounts().finally(() => { connectInFlight = null; });
  return connectInFlight;
}

async function requestAccounts(): Promise<{ address: string; chainId: number; provider: Eip1193Provider }> {
  // Fast sync check first so "nothing injected at all" gets its own precise error.
  const syncFound = getInjectedProviderSync();
  const provider = syncFound ?? await resolveProvider(2500);
  if (!provider) throw new MstError("NO_WALLET", NOT_DETECTED);
  setActiveProvider(provider);
  let accounts: unknown;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (err) {
    // EIP-2255 fallback for wallets that only expose permission requests.
    if ((err as { code?: number })?.code === -32601 || (err as { code?: number })?.code === -32602) {
      try {
        await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
        accounts = await provider.request({ method: "eth_accounts" });
      } catch (fallbackErr) {
        if (isRejection(fallbackErr)) throw new MstError("USER_REJECTED", CONNECT_REJECTED);
        throw fallbackErr;
      }
    } else if (isRejection(err)) {
      throw new MstError("USER_REJECTED", CONNECT_REJECTED);
    } else throw err;
  }
  const list = accounts as string[];
  if (!list || list.length === 0) throw new MstError("NO_WALLET", "No account was shared. Unlock BridgeKey and approve the connection, then try again.");
  // Chain id with net_version fallback (both standard; some wallets only answer one).
  let chainId: number = NaN;
  try {
    chainId = parseInt((await provider.request({ method: "eth_chainId" })) as string, 16);
  } catch {
    try {
      chainId = parseInt((await provider.request({ method: "net_version" })) as string, 10);
    } catch { /* surfaced below */ }
  }
  if (!Number.isFinite(chainId)) throw new MstError("RPC_ERROR", "Unable to connect to MST Blockchain.");
  return { address: list[0], chainId, provider };
}

/**
 * Sign an app message with personal_sign. The message is hex-encoded because
 * wallets expect hex payloads; the server decodes it back to UTF-8 before
 * ethers.verifyMessage. Private keys never leave the wallet.
 */
export async function signAppMessage(message: string, address?: string): Promise<{ address: string; signature: string }> {
  const provider = getInjectedProviderSync() ?? await resolveProvider(2500);
  if (!provider) throw new MstError("NO_WALLET", NOT_DETECTED);
  setActiveProvider(provider);
  let from = address ?? "";
  if (!from) {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    from = accounts?.[0] ?? "";
  }
  if (!from) throw new MstError("NO_WALLET", "No account was shared. Unlock BridgeKey and approve the connection, then try again.");
  const hex = `0x${Array.from(new TextEncoder().encode(message)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  try {
    const signature = (await provider.request({ method: "personal_sign", params: [hex, from] })) as string;
    if (!signature) throw new MstError("SIGN_REJECTED", "The wallet did not return a signature.");
    return { address: from, signature };
  } catch (err) {
    if (err instanceof MstError) throw err;
    if (isRejection(err)) throw new MstError("USER_REJECTED", "Signature request rejected in your wallet. Press Sign in again to retry.");
    throw err;
  }
}
// EIP-1193 has no "disconnect": disconnecting = forgetting the session locally.
export async function disconnectWallet(): Promise<void> {
  setActiveProvider(null);
}
export const isOnMstNetwork = (chainId: number | null) => chainId === ACTIVE_NETWORK.chainId;
export async function switchToMST(): Promise<number> {
  const provider = getInjectedProviderSync();
  if (!provider) throw new MstError("NO_WALLET", NOT_DETECTED);
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ACTIVE_NETWORK.chainIdHex }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) throw new MstError("NETWORK_SWITCH_REJECTED", "Network switch was rejected.");
    if (code === 4902) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ACTIVE_NETWORK.chainIdHex, chainName: ACTIVE_NETWORK.label,
            rpcUrls: [ACTIVE_NETWORK.rpcUrl], blockExplorerUrls: ACTIVE_NETWORK.explorerUrl ? [ACTIVE_NETWORK.explorerUrl] : [],
            nativeCurrency: { name: ACTIVE_NETWORK.currencySymbol, symbol: ACTIVE_NETWORK.currencySymbol, decimals: ACTIVE_NETWORK.currencyDecimals },
          }],
        });
      } catch (addErr) {
        if ((addErr as { code?: number })?.code === 4001) throw new MstError("NETWORK_SWITCH_REJECTED", "Network switch was rejected.");
        throw addErr;
      }
    } else throw err;
  }
  const chainHex = (await provider.request({ method: "eth_chainId" })) as string;
  return parseInt(chainHex, 16);
}
export function subscribeWalletEvents(opts: { onAccounts: (a: string[]) => void; onChain: (chainId: number) => void }): () => void {
  const provider = getInjectedProviderSync();
  if (!provider?.on || !provider?.removeListener) return () => undefined;
  const acc = (...args: unknown[]) => opts.onAccounts((args[0] as string[]) ?? []);
  const ch = (...args: unknown[]) => opts.onChain(parseInt(args[0] as string, 16));
  provider.on("accountsChanged", acc); provider.on("chainChanged", ch);
  return () => { provider.removeListener?.("accountsChanged", acc); provider.removeListener?.("chainChanged", ch); };
}
