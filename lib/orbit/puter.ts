"use client";
// Puter.js loader for Orbit "Post" mode.
//
// Puter is user-pays: no API key and no server. The SDK is imported dynamically
// so its weight is only pulled when a user actually generates an image, and it
// is never in the Orbit chat path.
//
// Docs: https://docs.puter.com/AI/txt2img/

export type PuterImage = { src: string; width: number; height: number };

type PuterSdk = {
  ai: {
    txt2img: (prompt: string, options?: Record<string, unknown>) => Promise<PuterImage>;
  };
  auth?: { signIn?: () => Promise<unknown>; getUser?: () => Promise<unknown> };
};

type PuterCache = { sdk: PuterSdk | null; pending: Promise<PuterSdk> | null };

const cache: PuterCache = { sdk: null, pending: null };

/** Resolves the Puter SDK, importing it at most once per page session. */
export function loadPuter(): Promise<PuterSdk> {
  if (typeof window === "undefined") return Promise.reject(new Error("Puter only runs in the browser."));
  if (cache.sdk) return Promise.resolve(cache.sdk);
  if (cache.pending) return cache.pending;

  cache.pending = import("@heyputer/puter.js")
    .then((mod) => {
      const sdk = ((mod as { puter?: PuterSdk }).puter ?? mod) as PuterSdk;
      if (!sdk?.ai?.txt2img) throw new Error("Puter loaded but the image API is missing.");
      cache.sdk = sdk;
      return sdk;
    })
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
  if (!navigator.onLine) return "You're offline. Reconnect and try again.";
  const msg = (e?.message ?? "").trim();
  return msg ? `Image generation failed: ${msg.slice(0, 140)}` : "Image generation failed. Try again.";
}

/** Downscale a data URL to a bounded JPEG thumbnail (localStorage is ~5MB). */
export function toThumbnail(dataUrl: string, max = 512): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
