# Orbit — AI companion (OpenRouter free models)

## Setup (2 min)
1. Create a key at https://openrouter.ai/keys (free models cost nothing, but a key is still required).
2. Add to `.env.local`:
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   # optional — default chain tries nemotron-nano :free → qwen3.8 :free → gemma-4 :free → ling-flash :free
   OPENROUTER_MODEL=
   ```
3. Restart `npm run dev` (server env loads at boot) and open `/orbit`.

## How it works
- `app/api/orbit/route.ts` — server proxy; key never reaches the browser. Streams SSE from
  `https://openrouter.ai/api/v1/chat/completions`. On 400/402/404/429 it tries the next model
  in the chain; otherwise it surfaces the upstream error instead of faking a reply.
- `app/orbit/page.tsx` — Grok-style chat: empty-state suggestions, streaming tokens, stop button,
  copy, new chat, thread persisted to localStorage. No extra chat deps.
- Without a key the page shows: "Orbit is not configured yet…" (HTTP 501 from the route).

## Pinning a model
Free-model ids retire often. Pick a working `:free` id from https://openrouter.ai/models and set
`OPENROUTER_MODEL=<id>` — or a comma-separated fallback chain, e.g.
`OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free,google/gemini-2.0-flash-exp:free`.
The active model is shown under the Orbit header and returned as `X-Orbit-Model`.
