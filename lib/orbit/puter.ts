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

type PuterSdk = {
  ai: {
    txt2img: (prompt: string, options?: Record<string, unknown>) => Promise<PuterImage>;
  };
  auth?: { signIn?: () => Promise<unknown>; getUser?: () => Promise<unknown> };
};

declare global {
  interface Window {
    puter?: PuterSdk;
  }
}

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

export const PUTER_MODELS = [
  { id: "gpt-image-1-mini", label: "GPT Image mini", provider: "openai-image-generation", hint: "fast, good default" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", provider: "openai-image-generation", hint: "higher quality, slower" },
  { id: "gemini-3-pro-image", label: "Nano Banana", provider: "gemini", hint: "good with text in images" },
  { id: "grok-imagine-image", label: "Grok Imagine", provider: "xai", hint: "fast, stylised" },
] as const;

export type PuterModel = (typeof PUTER_MODELS)[number];

export const PUTER_RATIOS = [
  { id: "square", label: "1:1", w: 1024, h: 1024 },
  { id: "portrait", label: "3:4", w: 768, h: 1024 },
  { id: "landscape", label: "4:3", w: 1024, h: 768 },
  { id: "wide", label: "16:9", w: 1344, h: 768 },
] as const;

export type PuterRatio = (typeof PUTER_RATIOS)[number];

/** Puter error codes are string-ish objects; surface something a user can act on. */
export function describePuterError(err: unknown): string {
  const e = err as { code?: string; message?: string; errorCode?: string } | null;
  const code = e?.code ?? e?.errorCode ?? "";
  if (code === "moderation_flagged")
    return "The image model's safety filter rejected that prompt. Try rewording it.";
  if (code === "insufficient_funds" || String(e?.message ?? "").includes("402"))
    return "Puter needs a signed-in account with credits for this image. Sign in with Puter and retry.";
  if (code === "upstream_failed")
    return "The image provider failed on their end. That's usually temporary — try again.";
  if (String(e?.message ?? "").includes("js.puter.com"))
    return "Couldn't load Puter. It runs from js.puter.com, which an ad blocker or privacy extension may be filtering — allow it for this site and retry.";
  if (!navigator.onLine) return "You're offline. Reconnect and try again.";
  const msg = (e?.message ?? "").trim();
  return msg ? `Image generation failed: ${msg.slice(0, 140)}` : "Image generation failed. Try again.";
}
