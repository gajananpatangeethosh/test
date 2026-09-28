import { NextRequest } from "next/server";
import { AI_NAME, APP_NAME, APP_URL } from "@/lib/brand";
import {
  MAX_TRANSFER, checkTransfer, currency, extractAddresses, extractAmounts, type TransferDraft,
} from "@/lib/orbit/transfer";

// Orbit "Transaction" mode — natural-language -> a transfer the user can approve.
//
// ── Nothing load-bearing comes from the model ────────────────────────────────
// An LLM cannot reliably reproduce a 40-character hex string, and it cannot be
// trusted with a number that becomes money. In testing it echoed a valid 40-char
// address back as 39 characters, and a 200-token budget returned empty content
// because it spent the whole allowance on `reasoning`.
//
// So the recipient AND the amount are extracted from the user's own text with
// regex. The model is called in exactly one situation: more than one candidate
// number, where it picks which one is the amount — and that pick is then
// rejected unless it is literally one of the candidates found in the text.
//
// Result: the wallet prompt always shows what the user typed, and a
// prompt-injected or hallucinating model can propose nothing that was not
// already present in their sentence.
//
// The model is a PARSER, never an executor: no signer, no key, and it cannot
// name a sender. Funds always originate from the connected wallet, and the human
// approves in their own wallet.
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
const MAX_TOKENS = 800;

const SYSTEM = `You read a sentence and decide which number is a transfer amount.

You are a PARSER. You do not execute anything and you have no wallet access. The recipient and the candidate numbers have ALREADY been extracted for you.

Reply with ONLY a JSON object. No prose. No markdown fence.

Success:
{"ok":true,"amount":"5"}

Failure:
{"ok":false,"question":"one short clarifying question"}

Rules:
- "amount" MUST be copied EXACTLY from the candidate list provided. Never invent, reformat or convert a number. If nothing in the list is the amount, return ok:false.
- Never mention, question, restate or alter the recipient address.
- If the user says "all", "everything", or "my whole balance", return ok:false and ask for an exact number.
- The maximum single transfer is ${MAX_TRANSFER} ${currency()}. If the amount exceeds it, return ok:false and say the limit is ${MAX_TRANSFER} ${currency()}.
- If no candidate is clearly the amount, return ok:false and ask what amount to send, in ${currency()}.
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

/** Model call, used only to disambiguate between candidate amounts. */
async function pickAmount(
  key: string, prompt: string, candidates: string[], to: string,
): Promise<{ amount: string } | { question: string }> {
  let lastError = "upstream error";
  for (const model of MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), HEADERS_TIMEOUT_MS);
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": `${APP_NAME} ${AI_NAME} Transfer`,
      },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: MAX_TOKENS, stream: false,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Recipient (already extracted, do not repeat or alter): ${to}\nCandidate amounts: ${candidates.join(", ")}\nCurrency: ${currency()}. Max per transfer: ${MAX_TRANSFER} ${currency()}.\n\nMessage: ${prompt}`,
          },
        ],
      }),
      signal: ac.signal,
    }).catch((e) => { lastError = `network: ${String(e).slice(0, 120)}`; return null; }).finally(() => clearTimeout(timer));

    if (!upstream) continue;
    if (!upstream.ok) {
      try { lastError = (await upstream.text()).slice(0, 200); } catch { /* keep last */ }
      if ([400, 402, 404, 429].includes(upstream.status) && model !== MODELS[MODELS.length - 1]) continue;
      return { question: `Orbit's parser hit an upstream error. ${lastError}` };
    }

    const payload = (await upstream.json().catch(() => null)) as
      | { choices?: { finish_reason?: string; message?: { content?: string } }[] } | null;
    const choice = payload?.choices?.[0];
    const parsed = extractJson(choice?.message?.content ?? "") as
      | { ok?: boolean; amount?: string; question?: string } | null;

    if (!parsed || typeof parsed !== "object") {
      lastError = choice?.finish_reason === "length" ? "model ran out of tokens" : "unreadable reply";
      if (model !== MODELS[MODELS.length - 1]) continue;
      return { question: `Which amount did you mean? Candidates: ${candidates.join(", ")}.` };
    }
    if (parsed.ok !== true || typeof parsed.amount !== "string")
      return { question: (parsed.question || "").trim() || `How much would you like to send in ${currency()}?` };

    // The pick must be a number that actually appeared in the user's sentence.
    const norm = parsed.amount.trim().replace(/,/g, "");
    const match = candidates.find((c) => Number(c) === Number(norm));
    if (!match) return { question: "I couldn't tell which number is the amount. Try naming it plainly." };
    return { amount: match };
  }
  return { question: `Orbit's transfer parser is unavailable right now. (${lastError})` };
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

  // 1. Recipient — deterministic, never round-trips through the model.
  const addresses = extractAddresses(prompt);
  if (addresses.length === 0)
    return Response.json({ ok: false, question: "I need the recipient's wallet address — 0x followed by 40 hex characters. I won't guess it." }, { status: 200 });
  if (addresses.length > 1)
    return Response.json({ ok: false, question: `That message has ${addresses.length} addresses in it. Send to just one per message so there's no ambiguity.`, candidates: addresses }, { status: 200 });
  const to = addresses[0];

  // 2. Amount — deterministic whenever the sentence is unambiguous.
  const candidates = extractAmounts(prompt);
  let amount: string;
  if (candidates.length === 1) {
    amount = candidates[0];
  } else {
    const picked = await pickAmount(key, prompt, candidates, to);
    if ("question" in picked) return Response.json({ ok: false, question: picked.question }, { status: 200 });
    amount = picked.amount;
  }

  // 3. Defence in depth: never forward a draft the validator rejects.
  const draft: TransferDraft = { to, amount, memo: "" };
  const check = checkTransfer(draft, body.from ?? null);
  if (!check.ok) return Response.json({ ok: false, question: check.error }, { status: 200 });

  return Response.json({
    ok: true,
    draft,
    // Surfaced so the UI can be honest about how the values were obtained.
    source: candidates.length === 1 ? "verbatim" : "model-picked",
  }, { status: 200 });
}
