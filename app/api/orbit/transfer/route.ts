import { NextRequest } from "next/server";
import { MAX_TRANSFER, checkTransfer, currency, type TransferDraft } from "@/lib/orbit/transfer";

// Orbit "Transaction" mode — natural-language -> structured transfer INTENT.
//
// ── Why the model never sees the address ────────────────────────────────────
// An LLM cannot reliably reproduce a 40-character hex string. During testing it
// echoed a valid 40-char address back as 39 characters and then "helpfully"
// reported it as invalid. Every character an LLM re-emits is a chance to corrupt
// a value that must be byte-exact.
//
// So the address is extracted DETERMINISTICALLY from the user's own text with a
// regex, and the model is only ever asked for things it is actually good at:
// is this a transfer, how much, and why. The recipient can never be hallucinated.
//
// The model is also a PARSER, not an executor: no signer, no key, and it cannot
// name a sender. Funds always originate from the connected wallet, and a human
// approves every field before anything is signed.
//
// `response_format` is deliberately NOT used: not every free-tier model on the
// chain supports it, and a 400 would burn the fallback list. The prompt demands
// bare JSON and `extractJson` below tolerates fences/prose.
const MODELS = Array.from(
  new Set(
    `${process.env.OPENROUTER_MODEL || ""},google/gemma-4-26b-a4b-it:free,qwen/qwen3.8-27b:free,inclusionai/ling-3.0-flash-sante:free,liquid/lfm-2.5-2.6b:free,nvidia/nemotron-3-super-120b-a12b:free`
      .split(",").map((s) => s.trim()).filter(Boolean),
  ),
);

const HEADERS_TIMEOUT_MS = 25_000;
// These free models emit `reasoning` before `content`. At 200 tokens a
// reasoning-heavy reply consumed the whole budget and returned empty content,
// which looked like "unparseable" rather than "truncated".
const MAX_TOKENS = 800;

// Exact, case-insensitive, and refuses to match a prefix of a longer hex run
// (so a 64-char tx hash is not mistaken for an address).
const ADDRESS_RE = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

const SYSTEM = `You read a user's sentence and pull out the numeric details of a native-currency transfer.

You are a PARSER. You do not execute anything and you have no wallet access, and the recipient address has ALREADY been extracted for you.

Reply with ONLY a JSON object. No prose. No markdown fence.

Success:
{"ok":true,"amount":"5","memo":"optional note"}

Failure:
{"ok":false,"question":"one short clarifying question"}

Rules:
- "amount" MUST be a plain positive decimal number as a string: no currency symbol, no thousands separators, no units, no words.
- The recipient address is already known. Never mention, question, restate or alter it.
- If the user says "all", "everything", or "my whole balance", return ok:false and ask for an exact number.
- The maximum single transfer is ${MAX_TRANSFER} ${currency()}. If the amount exceeds it, return ok:false and say the limit is ${MAX_TRANSFER} ${currency()}.
- If the amount is missing or ambiguous, return ok:false and ask what amount to send.
- If more than ONE transfer is described, return ok:false and ask them to do them one at a time.
- "memo" is optional context from the user, max 140 characters, "" if there is none.
- If the message does not ask to send money, return ok:false with a question asking what they want to send.
- If the user asks to send from some other person's wallet, return ok:false and explain they can only send from their own connected wallet.`;

/** Tolerate a fenced block or leading/trailing prose around the JSON. */
function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key)
    return Response.json({ error: "not_configured", message: "Orbit is not configured yet. Add OPENROUTER_API_KEY to .env.local — see ORBIT_SETUP.md." }, { status: 501 });

  let body: { prompt?: string; from?: string | null };
  try { body = await req.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "empty" }, { status: 400 });
  if (prompt.length > 600) return Response.json({ error: "too_long" }, { status: 400 });

  // 1. Deterministic address extraction — the model never touches this value.
  const found = prompt.match(ADDRESS_RE) ?? [];
  const unique = Array.from(new Set(found.map((a) => a.toLowerCase())));

  if (unique.length === 0) {
    return Response.json({
      ok: false,
      question: "I need the recipient's wallet address — 0x followed by 40 hex characters. I won't guess it.",
    }, { status: 200 });
  }
  if (unique.length > 1) {
    return Response.json({
      ok: false,
      question: `That message has ${unique.length} addresses in it. Send to just one per message so there's no ambiguity.`,
      candidates: unique,
    }, { status: 200 });
  }
  const to = unique[0];

  // 2. The model only decides the amount and whether this is a transfer at all.
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
        "X-Title": "MSTORA Orbit Transfer",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Recipient (already extracted, do not repeat or alter): ${to}\nCurrency: ${currency()}. Max per transfer: ${MAX_TRANSFER} ${currency()}.\n\nMessage: ${prompt}`,
          },
        ],
      }),
      signal: ac.signal,
    }).catch((e) => { lastError = `network: ${String(e).slice(0, 120)}`; return null; }).finally(() => clearTimeout(timer));

    if (!upstream) continue;
    if (!upstream.ok) {
      try { lastError = (await upstream.text()).slice(0, 200); } catch { /* keep last */ }
      if ([400, 402, 404, 429].includes(upstream.status) && model !== MODELS[MODELS.length - 1]) continue;
      return Response.json({ ok: false, question: `Orbit's parser hit an upstream error. ${lastError}` }, { status: 200 });
    }

    const payload = (await upstream.json().catch(() => null)) as
      | { choices?: { finish_reason?: string; message?: { content?: string } }[] }
      | null;

    const choice = payload?.choices?.[0];
    const raw = choice?.message?.content ?? "";
    const parsed = extractJson(raw) as
      | { ok?: boolean; amount?: string; memo?: string; question?: string }
      | null;

    if (!parsed || typeof parsed !== "object") {
      // Truncated on reasoning budget: try the next model rather than guessing.
      lastError = choice?.finish_reason === "length" ? "model ran out of tokens" : "unreadable reply";
      if (model !== MODELS[MODELS.length - 1]) continue;
      return Response.json({ ok: false, question: "I couldn't read that amount. Try: \"Send 5 MST\"." }, { status: 200 });
    }

    if (parsed.ok !== true || typeof parsed.amount !== "string") {
      return Response.json(
        { ok: false, question: (parsed.question || "").trim() || `How much would you like to send in ${currency()}?` },
        { status: 200 },
      );
    }

    // 3. Defence in depth: never forward a draft the validator rejects.
    const draft: TransferDraft = { to, amount: parsed.amount, memo: typeof parsed.memo === "string" ? parsed.memo : "" };
    const check = checkTransfer(draft, body.from ?? null);
    if (!check.ok) return Response.json({ ok: false, question: check.error }, { status: 200 });

    return Response.json({ ok: true, draft, model }, { status: 200 });
  }

  return Response.json({ ok: false, question: `Orbit's transfer parser is unavailable right now. (${lastError})` }, { status: 200 });
}
