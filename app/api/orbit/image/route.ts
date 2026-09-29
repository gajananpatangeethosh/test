import { NextRequest } from "next/server";
import { AI_NAME, APP_NAME, APP_URL } from "@/lib/brand";

// Orbit image generation → OpenRouter's dedicated Image API.
//
// This exists because the Puter path bills the *end user's* Puter account, and a
// throwaway guest session (or a spent free tier) rejects every call with
// `insufficient_funds`. OpenRouter uses the same key that already powers Orbit
// chat, so image generation works for whoever is running the app without anyone
// needing a Puter account.
//
// Key stays server-side. Returns a data URL so the browser never needs a
// separate object store, matching the in-thread image bubble.
//
// Docs: https://openrouter.ai/docs/api/api-reference/images/generate-an-image
const DEFAULT_MODELS = [
  // Cheapest first. FLUX.2 bills per megapixel; Seedream is a flat rate.
  "black-forest-labs/flux.2-pro",
  "bytedance-seed/seedream-4.5",
  "google/gemini-3.1-flash-image",
  "openai/gpt-5.4-image-2",
];
const MODELS = Array.from(
  new Set(
    `${process.env.OPENROUTER_IMAGE_MODEL || ""},${DEFAULT_MODELS.join(",")}`
      .split(",").map((s) => s.trim()).filter(Boolean),
  ),
);

const GENERATION_TIMEOUT_MS = 90_000;
// Cap what we forward. b64 payloads are large; this is a sanity bound, not a
// limit we expect to hit for a single 1K image.
const MAX_B64_CHARS = 12_000_000;

const ASPECT_PX: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
  "16:9": { w: 1344, h: 768 },
};

function mediaFromBytes(bytes: Uint8Array, header: string | null): string {
  if (header?.startsWith("image/")) return header.split(";")[0];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "";
}

/**
 * Last resort when Puter and OpenRouter both have nothing to bill.
 * Pollinations' legacy FLUX endpoint still serves anonymous requests.
 */
async function freeFlux(prompt: string, aspectRatio?: string): Promise<{ src: string } | { error: string }> {
  const size = ASPECT_PX[aspectRatio || "1:1"] ?? ASPECT_PX["1:1"];
  const params = new URLSearchParams({
    model: "flux",
    width: String(size.w),
    height: String(size.h),
    seed: String(Math.floor(Math.random() * 1_000_000)),
    private: "true",
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 800))}?${params}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), GENERATION_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
    if (!res.ok) return { error: `free image HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const media = mediaFromBytes(bytes, res.headers.get("content-type"));
    if (!media || bytes.byteLength < 1000) return { error: "free image returned no picture" };
    const b64 = Buffer.from(bytes).toString("base64");
    if (b64.length > MAX_B64_CHARS) return { error: "image too large to return inline" };
    return { src: `data:${media};base64,${b64}` };
  } catch (e) {
    return { error: ac.signal.aborted ? "free image timed out" : `free image: ${String(e).slice(0, 120)}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY || "";

  let body: { prompt?: string; model?: string; aspectRatio?: string; quality?: string; testMode?: boolean };
  try { body = await req.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "prompt_required" }, { status: 400 });

  // No app key (or it is out of credit below) must not dead-end the composer.
  // Puter already failed the user with insufficient_funds; this route is the way out.
  if (!key) {
    const free = await freeFlux(prompt, body.aspectRatio);
    if ("src" in free) return Response.json({ ok: true, src: free.src, model: "pollinations/flux", fallback: true });
    return Response.json(
      { error: "not_configured", message: "Image generation needs OPENROUTER_API_KEY, and the free fallback also failed. Add the key to .env.local — see ORBIT_SETUP.md." },
      { status: 501 },
    );
  }

  // Respect an explicit model choice, but only if it's one we know about —
  // otherwise fall back to the chain so a stale id can't 400 forever.
  const chosen = body.model && MODELS.includes(body.model) ? body.model : MODELS[0];
  const chain = chosen === MODELS[0] ? MODELS : [chosen, ...MODELS.filter((m) => m !== chosen)];

  let lastError = "upstream error";
  for (const model of chain) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), GENERATION_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": APP_URL,
          "X-Title": `${APP_NAME} ${AI_NAME}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          ...(body.aspectRatio ? { aspect_ratio: body.aspectRatio } : {}),
          ...(body.quality ? { quality: body.quality } : {}),
          ...(body.testMode ? { quality: "low" } : {}),
        }),
        signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      lastError = ac.signal.aborted ? "timed out" : `network: ${String(e).slice(0, 120)}`;
      continue;
    }
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json().catch(() => null)) as {
        data?: { b64_json?: string; media_type?: string }[];
        usage?: { cost?: number };
      } | null;
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) { lastError = "upstream returned no image data"; continue; }
      if (b64.length > MAX_B64_CHARS) { lastError = "image too large to return inline"; continue; }
      const media = json?.data?.[0]?.media_type || "image/png";
      return Response.json({
        ok: true,
        src: `data:${media};base64,${b64}`,
        model,
        ...(typeof json?.usage?.cost === "number" ? { costUsd: json.usage.cost } : {}),
      });
    }

    // Model unavailable / rate-limited / out of credit on this key → try the next.
    let detail = "";
    try { detail = (await res.text()).slice(0, 300); } catch { /* keep last */ }
    lastError = detail || `HTTP ${res.status}`;
    if (![400, 402, 404, 429, 502, 503].includes(res.status)) break;
  }

  const free = await freeFlux(prompt, body.aspectRatio);
  if ("src" in free) {
    return Response.json({ ok: true, src: free.src, model: "pollinations/flux", fallback: true });
  }

  return Response.json({ error: "upstream", message: `Image generation failed. Last: ${lastError}` }, { status: 502 });
}
