"use client";
// Puter.js loader for Orbit "Post" mode.
//
// Puter is user-pays: no API key and no server.
//
// Puter is deliberately NOT an installed dependency. The official distribution
// is a browser script that publishes a `puter` global (see the SDK docs); the
// npm package is the same source but resolves its own internal chunks at
// runtime. Bundling it with Turbopack therefore fails with
// "Failed to load chunk .../node_modules_%40heyputer_kv_*.js" before any API
// call is made — which costs no credits, it just never starts. So we inject the
// CDN tag on first use: nothing is fetched until a user actually generates.
//
// Docs: https://docs.puter.com/AI/txt2img/

export type PuterImage = { src: string; width: number; height: number };

export type PuterUser = { uuid?: string; username?: string; is_temp?: boolean } | null;

type PuterSdk = {
  ai: {
    txt2img: (prompt: string, options?: Record<string, unknown>) => Promise<PuterImage>;
  };
  auth?: {
    signIn?: (options?: { request_auth?: boolean; attempt_temp_user_creation?: boolean }) => Promise<unknown>;
    getUser?: () => Promise<NonNullable<PuterUser>>;
    isSignedIn?: () => boolean;
    signOut?: () => void;
  };
};

declare global {
  interface Window {
    puter?: PuterSdk;
  }
}

/**
 * Image model catalogue, from https://docs.puter.com/AI/txt2img/.
 *
 * Model IDs are volatile: OpenAI retired `gpt-image-1`/`-1-mini`/`-1.5`, and the
 * Together routes are excluded entirely. Re-check these when a generation starts
 * failing with `bad_request` — the docs are the source of truth, not this file.
 */
export type PuterModel = {
  id: string;
  label: string;
  provider: string;
  hint: string;
  /** Cloudflare Schnell always renders 1024x1024 and ignores the requested size. */
  fixedSize?: boolean;
};

export const PUTER_MODELS: readonly PuterModel[] = [
  { id: "gpt-image-2", label: "GPT Image 2", provider: "openai", hint: "default, balanced" },
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5", provider: "openai", hint: "newer, richest detail" },
  { id: "gemini-3.1-flash-image", label: "Nano Banana 2", provider: "gemini", hint: "fast, good with text" },
  { id: "gemini-3-pro-image", label: "Nano Banana Pro", provider: "gemini", hint: "best prompt following" },
  { id: "grok-imagine-image", label: "Grok Imagine", provider: "xai", hint: "fast, stylised" },
  { id: "@cf/black-forest-labs/flux-1-schnell", label: "FLUX Schnell", provider: "cloudflare", hint: "cheapest, fixed 1:1", fixedSize: true },
] as const;

export type ImageOptions = {
  model: string;
  provider: string;
  ratio: { w: number; h: number };
  /** Returns a sample image without spending credits — proves the wiring works. */
  testMode?: boolean;
};

/** Single entry point for generation so test mode can never drift from real mode. */
export async function generateImage(prompt: string, opts: ImageOptions): Promise<PuterImage> {
  const puter = await loadPuter();
  const result = await puter.ai.txt2img(prompt, {
    provider: opts.provider,
    model: opts.model,
    ratio: opts.ratio,
    ...(opts.testMode ? { test_mode: true } : {}),
  });
  if (!result?.src) throw new Error("The model returned no image.");
  return result;
}

export const PUTER_RATIOS = [
  { id: "square", label: "1:1", w: 1024, h: 1024 },
  { id: "portrait", label: "3:4", w: 768, h: 1024 },
  { id: "landscape", label: "4:3", w: 1024, h: 768 },
  { id: "wide", label: "16:9", w: 1344, h: 768 },
] as const;

export type PuterRatio = (typeof PUTER_RATIOS)[number];

const CDN = "https://js.puter.com/v2/";
const LOAD_TIMEOUT_MS = 20000;

const cache: { sdk: PuterSdk | null; pending: Promise<PuterSdk> | null } = { sdk: null, pending: null };

const OFFLINE =
  "Could not load the Puter SDK from js.puter.com. Check your connection, then disable any ad blocker or privacy extension for this site and retry.";

function ready(): boolean {
  return typeof window !== "undefined" && !!window.puter?.ai?.txt2img;
}

function injectScript(): Promise<PuterSdk> {
  return new Promise((resolve, reject) => {
    const fail = (msg: string) => reject(new Error(msg));
    const settle = () => (ready() ? resolve(window.puter as PuterSdk) : fail("Puter loaded but the image API is missing."));

    // A tag may already be in flight (double click, or a previous attempt that
    // never settled). Never add a second one — just wait on the global.
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CDN}"]`);
    if (existing) {
      if (ready()) { resolve(window.puter as PuterSdk); return; }
      existing.addEventListener("load", settle, { once: true });
      existing.addEventListener("error", () => fail(OFFLINE), { once: true });
      return;
    }

    const tag = document.createElement("script");
    tag.src = CDN;
    tag.async = true;
    const timer = setTimeout(() => fail("Timed out loading the Puter SDK from js.puter.com."), LOAD_TIMEOUT_MS);
    tag.onload = () => { clearTimeout(timer); settle(); };
    tag.onerror = () => { clearTimeout(timer); fail(OFFLINE); };
    document.head.appendChild(tag);
  });
}

/** Resolves the Puter SDK, fetching the CDN script at most once per page session. */
export function loadPuter(): Promise<PuterSdk> {
  if (typeof window === "undefined") return Promise.reject(new Error("Puter only runs in the browser."));
  if (cache.sdk) return Promise.resolve(cache.sdk);
  if (ready()) { cache.sdk = window.puter as PuterSdk; return Promise.resolve(cache.sdk); }
  if (cache.pending) return cache.pending;

  cache.pending = injectScript()
    .then((sdk) => { cache.sdk = sdk; return sdk; })
    .catch((err) => {
      // Reset so a transient network failure doesn't permanently poison the session.
      cache.pending = null;
      throw err instanceof Error ? err : new Error(String(err));
    });

  return cache.pending;
}

/**
 * Reads the Puter account this page is on, without prompting. Returns null when
 * nobody has signed in — Puter then bills a throwaway guest session, which has
 * no credits, so a zero balance here does not mean *your* account is empty.
 */
export async function signedInUser(): Promise<PuterUser> {
  const sdk = await loadPuter();
  if (!sdk.auth?.isSignedIn?.()) return null;
  try { return (await sdk.auth.getUser?.()) ?? null; } catch { return null; }
}

/**
 * Opens Puter's sign-in popup. Must be called straight from a click — the popup
 * only counts as user-initiated if the activation hasn't been spent by an await.
 * `request_auth` forces the account picker so a stale guest token can be swapped.
 */
export async function signInPuter(): Promise<NonNullable<PuterUser>> {
  const sdk = await loadPuter();
  await sdk.auth?.signIn?.({ request_auth: true });
  const user = await signedInUser();
  if (!user) throw new Error("Puter sign-in didn't finish. Try again.");
  return user;
}

/**
 * Signs this page out of Puter and drops the cached SDK handle. Puter keeps the
 * token in `localStorage`, so the next generation prompts for a fresh account
 * instead of quietly reusing whatever session was wrong.
 */
export function signOutPuter(): void {
  const sdk = cache.sdk;
  cache.sdk = null;
  cache.pending = null;
  try {
    sdk?.auth?.signOut?.();
  } catch { /* sign-out is best-effort; a missing SDK just means no session. */ }
}

/** Puter error codes are string-ish objects; surface something a user can act on. */
/** Puter error codes are string-ish objects; surface something a user can act on. */
export function describePuterError(err: unknown): string {
  const e = err as { code?: string; message?: string; errorCode?: string } | null;
  const code = String(e?.code ?? e?.errorCode ?? "");
  const msg = (e?.message ?? "").trim();
  if (code === "moderation_flagged")
    return "The image model's safety filter rejected that prompt. Try rewording it.";
  if (code === "popup_blocked")
    return "Your browser blocked the Puter sign-in popup. Click 'Sign in with Puter' again and allow the popup.";
  if (code === "auth_window_closed")
    return "Sign-in was cancelled. Click 'Sign in with Puter' to try again.";
  // Puter reports a zero balance for whichever account the page is on. On a
  // third-party site that is often a throwaway guest session, not the account
  // the user checks in their dashboard — so don't tell them to pay for credits
  // their account still has.
  if (code === "insufficient_funds" || msg.includes("402") || msg.includes("no credits remaining"))
    return "Puter declined this generation for lack of credits (insufficient_funds). On a third-party site "
      + "that usually means the page is on a different account than the one in your dashboard — sign in with "
      + "Puter in the composer, pick the account whose usage bar you recognise, and retry. If the composer "
      + "already shows that account, the free-tier allowance is spent; the paid model here bills your Puter "
      + "balance, so top up at puter.com or use FLUX Schnell (cheapest).";
  if (code === "upstream_failed")
    return "The image provider failed on their end. That's usually temporary — try again.";
  if (msg.includes("js.puter.com"))
    return "Couldn't load Puter. It runs from js.puter.com, which an ad blocker or privacy extension may be filtering — allow it for this site and retry.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Reconnect and try again.";
  return msg ? `Image generation failed: ${msg.slice(0, 140)}` : "Image generation failed. Try again.";
}
