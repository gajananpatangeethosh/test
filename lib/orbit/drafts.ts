"use client";
// Local draft shelf for Orbit "Post" mode.
//
// HONESTY NOTE: MSTORA has no backend yet, so a "published" post cannot be
// persisted server-side. This stores a bounded, downscaled local draft so the
// feature is usable today, and the UI says so plainly rather than implying the
// post went live.
//
// Modelled as a real external store (localStorage + subscriber set) so
// components can read it with useSyncExternalStore instead of setState-in-effect.
import { toThumbnail } from "./puter";

export type OrbitDraft = {
  id: string;
  caption: string;
  image: string;
  prompt: string;
  model: string;
  createdAt: number;
};

const KEY = "mstora-orbit-drafts";
const MAX_DRAFTS = 12;
const EMPTY = "[]";

const listeners = new Set<() => void>();

const readRaw = (): OrbitDraft[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || EMPTY);
    return Array.isArray(parsed) ? (parsed as OrbitDraft[]) : [];
  } catch { return []; }
};

const emit = () => { for (const l of listeners) l(); };

const write = (drafts: OrbitDraft[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); return true; }
  catch { return false; } // quota exceeded
};

/** Subscribe to draft changes. */
export function subscribeDrafts(onChange: () => void): () => void {
  listeners.add(onChange);
  // A draft saved in another tab must show up here too.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(onChange); window.removeEventListener("storage", onStorage); };
}

/**
 * Snapshot is a JSON *string* so it compares by value — a fresh object here
 * would make useSyncExternalStore loop forever.
 */
export const getDraftsSnapshot = (): string => {
  if (typeof window === "undefined") return EMPTY;
  try { return localStorage.getItem(KEY) || EMPTY; } catch { return EMPTY; }
};

/** Server render has no localStorage. */
export const getServerDraftsSnapshot = (): string => EMPTY;

export const parseDrafts = (snapshot: string): OrbitDraft[] => {
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed) ? (parsed as OrbitDraft[]) : [];
  } catch { return []; }
};

/** Stores a thumbnail (not the full-res data URL) so we stay well under quota. */
export async function saveDraft(
  input: Omit<OrbitDraft, "id" | "image" | "createdAt"> & { image: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const image = await toThumbnail(input.image, 512);
  const draft: OrbitDraft = {
    id: `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    caption: input.caption.slice(0, 500),
    prompt: input.prompt.slice(0, 500),
    model: input.model,
    image,
    createdAt: Date.now(),
  };
  if (!write([draft, ...readRaw()].slice(0, MAX_DRAFTS)))
    return { ok: false, error: "Could not save — this browser's storage is full." };
  emit();
  return { ok: true };
}

export function deleteDraft(id: string): void {
  write(readRaw().filter((d) => d.id !== id));
  emit();
}
