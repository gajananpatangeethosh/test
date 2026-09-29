// Client for the server-side OpenRouter image route (app/api/orbit/image).
//
// Two engines now back the Post composer:
//   - "openrouter" — the app's image route. Uses OPENROUTER_API_KEY, then a free
//     FLUX fallback if that key is missing or out of credit. This is the default,
//     so a Puter insufficient_funds decline does not block generation.
//   - "puter" — Puter.js user-pays, billed to the end user's own Puter account.
//     A guest session or a spent free tier fails with `insufficient_funds`;
//     the composer retries on the app route.
//
// The server route returns a data URL, so there is nothing to persist here.

export type ImageEngine = "openrouter" | "puter";

export type OpenRouterImage = { src: string; model?: string; costUsd?: number; fallback?: boolean };

export type OpenRouterImageOptions = {
  model?: string;
  aspectRatio?: string;
  quality?: string;
  testMode?: boolean;
};

/** Calls our image route. Throws with a message safe to show the user. */
export async function openrouterImage(prompt: string, opts: OpenRouterImageOptions = {}): Promise<OpenRouterImage> {
  const res = await fetch("/api/orbit/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, ...opts }),
  });
  const json = (await res.json().catch(() => ({}))) as
    | (OpenRouterImage & { ok: true })
    | { ok?: false; message?: string; error?: string };

  if (json && typeof json === "object" && "src" in json && json.src) {
    return {
      src: json.src,
      model: (json as OpenRouterImage).model,
      costUsd: (json as OpenRouterImage).costUsd,
      fallback: (json as OpenRouterImage).fallback,
    };
  }
  const message = (json as { message?: string }).message || `HTTP ${res.status}`;
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  throw err;
}
