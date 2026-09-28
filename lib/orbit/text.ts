"use client";
// One-shot text generation through the existing /api/orbit proxy.
//
// /api/orbit streams SSE. Post mode only needs a short, non-streaming answer
// (a refined image prompt, a caption), so this consumes the same stream to
// completion and returns the full string. Reusing the route keeps one place
// for the key, the free-model fallback chain, and the header timeout.

export async function orbitText(
  messages: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/orbit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "", buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta as
          | { content?: string; reasoning?: string; reasoning_content?: string } | undefined;
        const text = delta?.content || delta?.reasoning || delta?.reasoning_content;
        if (text) acc += text;
      } catch { /* partial chunk — skip */ }
    }
  }
  return acc.trim();
}
