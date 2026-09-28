import { NextRequest } from "next/server";

// Orbit → OpenRouter proxy. The API key stays server-side (never NEXT_PUBLIC).
// Model: OPENROUTER_MODEL (single id, or comma-separated fallback chain).
// Order matters: fastest non-reasoning :free models first, so the UI starts
// streaming in a second or two. Reasoning models (`:…-reasoning:free`) emit
// `delta.reasoning` for many seconds before any `delta.content`, which reads as
// a hang, and the huge Nemotron tiers are heavily rate-limited on the free pool.
const DEFAULT_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "qwen/qwen3.8-27b:free",
  "inclusionai/ling-3.0-flash-sante:free",
  "liquid/lfm-2.5-2.6b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];
const MODELS = Array.from(
  new Set(
    `${process.env.OPENROUTER_MODEL || ""},${DEFAULT_MODELS.join(",")}`
      .split(",").map((s) => s.trim()).filter(Boolean),
  ),
);

// Free-tier models queue hard. Bound only the wait for *response headers*, then
// clear the timer so a slow-but-alive generation can stream for as long as it
// needs. Without this a dead or saturated :free model hangs the request.
const HEADERS_TIMEOUT_MS = 25_000;


const SYSTEM = `You are Orbit, the in-app AI companion of MSTORA — a social + creator-coin platform on MST Blockchain (testnet chain 91562037, currency tMSTC; mainnet chain 4646).
Core loop: Create → Discover → Collect → Trade → Earn. Creator coins and post coins are planned on-chain via factory contracts (not deployed yet).
Be concise, witty, and helpful like a social AI companion. Use short paragraphs, minimal emojis. Never invent contract addresses, balances, or transaction hashes. If asked for live chain data, say which MST explorer page to check.`;

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key) return Response.json({ error: "not_configured", message: "Orbit is not configured yet. Add OPENROUTER_API_KEY to .env.local — see ORBIT_SETUP.md." }, { status: 501 });
  let body: { messages?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  const messages = (body.messages ?? []).slice(-30).filter((m) => m?.content?.trim());
  if (messages.length === 0) return Response.json({ error: "empty" }, { status: 400 });

  let lastError = "upstream error";
  for (const model of MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), HEADERS_TIMEOUT_MS);
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mstora.app",
        "X-Title": "MSTORA Orbit",
      },
      body: JSON.stringify({
        model, stream: true,
        messages: [{ role: "system", content: SYSTEM }, ...messages],
        provider: { sort: "latency" },
      }),
      signal: ac.signal,
    }).catch((e) => { lastError = `network: ${String(e).slice(0, 120)}`; return null; }).finally(() => clearTimeout(timer));
    if (!upstream) continue;
    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Orbit-Model": model },
      });
    }
    // Retire/rate-limit/quota → try next model. Anything else → stop and report.
    if ([400, 402, 404, 429].includes(upstream.status) && model !== MODELS[MODELS.length - 1]) {
      try { lastError = (await upstream.text()).slice(0, 200); } catch { /* keep last */ }
      continue;
    }
    try { lastError = (await upstream.text()).slice(0, 300); } catch { /* keep last */ }
    return Response.json({ error: "upstream", message: lastError }, { status: 502 });
  }
  return Response.json({ error: "upstream", message: `All models failed. Last: ${lastError}` }, { status: 502 });
}
