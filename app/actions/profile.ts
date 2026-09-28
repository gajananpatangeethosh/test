"use server";

import { revalidatePath } from "next/cache";
import { getLiveProfilePage, toggleFollowProfile, upsertProfile } from "@/lib/db/dal";
import { getSession, requireSession } from "@/lib/db/session";

export async function saveProfileAction(input: {
  username: string;
  displayName?: string;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
  location?: string;
}) {
  try {
    const session = await requireSession();
    const profile = await upsertProfile(session.address, input);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/creator/${profile.username}`);
    return { ok: true as const, profile };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "SAVE_PROFILE_FAILED" };
  }
}

export async function getProfilePageAction(username: string) {
  try {
    const session = await getSession().catch(() => null);
    const page = await getLiveProfilePage(username, session?.address ?? null);
    if (!page) return { ok: false as const, error: "PROFILE_NOT_FOUND" };
    return { ok: true as const, ...page };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "PROFILE_FAILED" };
  }
}

export async function toggleFollowAction(username: string) {
  try {
    const session = await requireSession();
    const result = await toggleFollowProfile(session.address, username);
    revalidatePath("/home");
    revalidatePath("/explore");
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "FOLLOW_FAILED" };
  }
}
