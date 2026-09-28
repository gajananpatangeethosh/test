"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ImagePlus, Loader2, Sparkles, Download, RefreshCw, Trash2, Wand2, PenLine, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { orbitText } from "@/lib/orbit/text";
import {
  deleteDraft, getDraftsSnapshot, getServerDraftsSnapshot,
  parseDrafts, saveDraft, subscribeDrafts,
} from "@/lib/orbit/drafts";
import {
  PUTER_MODELS, PUTER_RATIOS, describePuterError, loadPuter,
  type PuterModel, type PuterRatio,
} from "@/lib/orbit/puter";

const PROMPT_IDEAS = [
  "a neon-lit night market in a rain-soaked cyberpunk alley, cinematic",
  "portrait of a golden retriever astronaut, studio lighting",
  "abstract 3d render of a glass coin floating over a dark grid",
];

export function PostPanel() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<PuterModel>(PUTER_MODELS[0]);
  const [ratio, setRatio] = useState<PuterRatio>(PUTER_RATIOS[0]);
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [gen, setGen] = useState(false);
  const [llm, setLlm] = useState<"enhance" | "caption" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const draftSnapshot = useSyncExternalStore(subscribeDrafts, getDraftsSnapshot, getServerDraftsSnapshot);
  const drafts = useMemo(() => parseDrafts(draftSnapshot), [draftSnapshot]);

  const enhance = async () => {
    if (!prompt.trim() || llm) return;
    setLlm("enhance"); setError(""); setNotice("");
    try {
      const out = await orbitText([
        { role: "user", content: `Rewrite this as a vivid image-generation prompt. Add concrete subject, composition, lighting and mood. Reply with the prompt only, no quotes, no preamble, under 60 words.\n\n${prompt.trim()}` },
      ]);
      if (out) setPrompt(out.replace(/^["'`]|["'`]$/g, "").trim());
    } catch (e) { setError((e as Error).message); }
    finally { setLlm(null); }
  };

  const makeCaption = async () => {
    if (llm) return;
    setLlm("caption"); setError(""); setNotice("");
    try {
      const out = await orbitText([
        { role: "user", content: `Write a short social caption (max 180 characters) for this image. No hashtags unless one fits naturally. No preamble — just the caption.\n\nImage prompt: ${prompt.trim() || "an abstract coin artwork"}` },
      ]);
      if (out) setCaption(out.trim());
    } catch (e) { setError((e as Error).message); }
    finally { setLlm(null); }
  };

  const generate = async () => {
    if (gen) return;
    setGen(true); setError(""); setNotice("");
    try {
      const puter = await loadPuter();
      const result = await puter.ai.txt2img(prompt.trim(), {
        provider: model.provider,
        model: model.id,
        ratio: { w: ratio.w, h: ratio.h },
      });
      if (!result?.src) throw new Error("The model returned no image.");
      setImage(result.src);
      // A data URL is not persistable server-side; tell the user up front.
      setNotice("Generated in your browser via Puter. Nothing is uploaded to MSTORA — save a draft or download it.");
    } catch (e) { setError(describePuterError(e)); }
    finally { setGen(false); }
  };

  const download = () => {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = `mstora-orbit-${Date.now()}.png`;
    a.click();
  };

  const save = async () => {
    if (!image) return;
    setError(""); setNotice("");
    const res = await saveDraft({ caption, image, prompt: prompt.trim(), model: model.label });
    if (!res.ok) { setError(res.error); return; }
    setNotice("Saved to this device only. Publishing needs the MSTORA backend, which isn't live yet.");
  };

  return <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="max-w-2xl mx-auto pb-10 space-y-5">
      <div>
        <h1 className="text-xl font-bold">Generate a post</h1>
        <p className="muted text-sm mt-1">Describe the image. Orbit writes the prompt and caption; Puter draws it.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 space-y-3">
        <label className="block text-sm muted" htmlFor="orbit-img-prompt">Image prompt</label>
        <textarea id="orbit-img-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
          placeholder="e.g. a neon-lit night market in a rain-soaked cyberpunk alley, cinematic"
          className="w-full rounded-xl bg-white/[.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#5b616b] resize-y" />
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_IDEAS.map((p) => (
            <button key={p} onClick={() => setPrompt(p)}
              className="rounded-full border border-white/12 px-3 py-1 text-[11px] muted hover:text-white hover:border-teal-300/40 transition max-w-full truncate">
              {p.length > 42 ? p.slice(0, 42) + "…" : p}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={() => void enhance()} disabled={!prompt.trim() || llm !== null} className="text-sm">
            {llm === "enhance" ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}Enhance prompt
          </Button>
          <Button onClick={() => void makeCaption()} disabled={llm !== null} className="text-sm">
            {llm === "caption" ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}Write caption
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
          <div className="text-sm muted mb-2">Model</div>
          <div className="space-y-1.5">
            {PUTER_MODELS.map((m) => (
              <button key={m.id} onClick={() => setModel(m)} disabled={gen}
                className={cn("w-full text-left rounded-xl border px-3 py-2 transition",
                  model.id === m.id ? "border-teal-300/60 bg-teal-300/10" : "border-white/10 hover:border-white/25",
                  gen && "opacity-50")}>
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] muted">{m.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4 space-y-4">
          <div>
            <div className="text-sm muted mb-2">Aspect ratio</div>
            <div className="flex flex-wrap gap-1.5">
              {PUTER_RATIOS.map((r) => (
                <button key={r.id} onClick={() => setRatio(r)} disabled={gen}
                  className={cn("rounded-full border px-3 py-1.5 text-xs transition",
                    ratio.id === r.id ? "border-teal-300/60 bg-teal-300/10 text-white" : "border-white/10 muted hover:text-white",
                    gen && "opacity-50")}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm muted mb-2">Caption</div>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4}
              placeholder="A caption appears here, or write your own."
              className="w-full rounded-xl bg-white/[.04] border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-teal-300/50 placeholder:text-[#5b616b] resize-y" />
          </div>
        </div>
      </div>

      {error && <p className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300 break-words">
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />{error}
      </p>}
      {notice && <p className="rounded-xl border border-teal-300/20 bg-teal-300/[.07] p-3 text-sm text-teal-200 break-words">{notice}</p>}

      <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <Button onClick={() => void generate()} disabled={!prompt.trim() || gen} className="w-full">
          {gen ? <><Loader2 size={15} className="animate-spin" />Drawing…</> : <><ImagePlus size={15} />{image ? "Regenerate" : "Generate image"}</>}
        </Button>
        <p className="text-[11px] muted text-center mt-2">Image generation runs on Puter and is billed to your Puter account, not MSTORA.</p>

        {image && (
          <div className="mt-4 space-y-3">
            {/* Data URL from Puter — next/image cannot optimize these. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Generated by Puter" className="w-full rounded-xl border border-white/10" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void generate()} disabled={gen} className="text-sm">
                <RefreshCw size={14} />Regenerate
              </Button>
              <Button onClick={download} className="text-sm"><Download size={14} />Download</Button>
              <Button onClick={() => void save()} className="text-sm"><Sparkles size={14} />Save as draft</Button>
            </div>
          </div>
        )}
      </div>

      {drafts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Drafts on this device</h2>
          <div className="grid grid-cols-2 gap-3">
            {drafts.map((d) => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-white/[.03] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image} alt={d.caption || d.prompt} className="w-full aspect-square object-cover" />
                <div className="p-2.5 space-y-1.5">
                  <p className="text-[11px] leading-snug line-clamp-3">{d.caption || d.prompt || "Untitled"}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] muted truncate">{d.model}</span>
                    <button onClick={() => deleteDraft(d.id)} aria-label="Delete draft"
                      className="shrink-0 text-muted hover:text-red-300 transition"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>;
}
