// Wallet discovery: EIP-6963 announcements (standard multi-wallet discovery)
// + window.ethereum fallback + wallet-namespace globals scan.
//
// Why this exists: checking `window.ethereum` once at click time misses wallets
// that (a) inject late, (b) only announce via EIP-6963 events, or (c) inject
// under their own global and proxy into window.ethereum asynchronously.
// This module handles all three without guessing any proprietary BridgeKey API —
// every candidate is validated by EIP-1193 shape (`request` function) only.
import type { Eip1193Provider, Eip6963ProviderDetail } from "./types";

let announced: Eip6963ProviderDetail[] = [];
let listening = false;
let active: Eip1193Provider | null = null;

export function startDiscoveryListener(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent).detail as Eip6963ProviderDetail | undefined;
    if (!detail?.provider || typeof (detail.provider as Eip1193Provider).request !== "function") return;
    if (!announced.some((d) => d.info?.uuid && d.info.uuid === detail.info?.uuid)) announced.push(detail);
  });
}

export function requestProviderAnnouncements(): void {
  if (typeof window === "undefined") return;
  startDiscoveryListener();
  // Wallets re-announce on request — recovers announcements fired before our listener attached.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getAnnouncedProviders(): Eip6963ProviderDetail[] {
  return [...announced];
}

export function isBridgeKeyProvider(p: Eip1193Provider | null | undefined): boolean {
  if (!p) return false;
  if ((p as Eip1193Provider & { isBridgeKey?: boolean }).isBridgeKey === true) return true;
  return false;
}

export function isBridgeKeyDetail(d: Eip6963ProviderDetail): boolean {
  if (isBridgeKeyProvider(d.provider)) return true;
  const rdns = (d.info?.rdns ?? "").toLowerCase();
  const name = (d.info?.name ?? "").toLowerCase();
  return rdns.includes("bridgekey") || name.includes("bridgekey");
}

function hasRequestFn(x: unknown): x is Eip1193Provider {
  return !!x && typeof (x as Eip1193Provider).request === "function";
}

/** window.ethereum, preferring a BridgeKey-identified provider when several exist. */
export function getWindowEthereum(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth)) {
    const list = eth as Eip1193Provider[];
    return list.find(isBridgeKeyProvider) ?? (hasRequestFn(list[0]) ? list[0] : null);
  }
  const withProviders = eth as Eip1193Provider & { providers?: Eip1193Provider[] };
  if (Array.isArray(withProviders.providers) && withProviders.providers.length > 0)
    return withProviders.providers.find(isBridgeKeyProvider) ?? withProviders.providers[0];
  return hasRequestFn(withProviders) ? withProviders : null;
}

/** Wallet-specific globals (e.g. window.bridgekey). Validated by shape — never trusted blindly. */
function scanNamespaceGlobals(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  for (const key of ["bridgekey", "$bridgekey", "bridgeKey", "BridgeKey"]) {
    const g = w[key] as { ethereum?: unknown; provider?: unknown } | undefined;
    if (!g) continue;
    for (const candidate of [g, g.ethereum, g.provider]) {
      if (hasRequestFn(candidate)) return candidate;
    }
  }
  return null;
}

/** Synchronous best-effort resolution (no waiting). */
export function getInjectedProviderSync(): Eip1193Provider | null {
  if (active) return active;
  const announcedBk = announced.find(isBridgeKeyDetail);
  if (announcedBk) return announcedBk.provider;
  return getWindowEthereum() ?? scanNamespaceGlobals() ?? announced[0]?.provider ?? null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Async resolution with late-injection tolerance: dispatches EIP-6963 discovery
 * and polls briefly so extensions that inject after page load are still found.
 */
export async function resolveProvider(timeoutMs = 2000): Promise<Eip1193Provider | null> {
  if (typeof window === "undefined") return null;
  requestProviderAnnouncements();
  const found = getInjectedProviderSync();
  if (found) return found;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(150);
    const late = getInjectedProviderSync();
    if (late) return late;
  }
  return null;
}

export function setActiveProvider(p: Eip1193Provider | null): void {
  active = p;
}

export function providerLabel(p: Eip1193Provider | null): string {
  if (isBridgeKeyProvider(p)) return "BridgeKey";
  const match = announced.find((d) => d.provider === p);
  if (match && /bridgekey/i.test(match.info?.name ?? "")) return "BridgeKey";
  return "Injected Wallet";
}
