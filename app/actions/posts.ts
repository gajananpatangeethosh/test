"use server";

import { revalidatePath } from "next/cache";
import { createLivePost, deleteLivePost, getLiveFeed, getLivePost, getLivePostsByAuthor } from "@/lib/db/dal";
import { getSession, requireSession } from "@/lib/db/session";

export async function getFeedAction(limit = 30) {
  const session = await getSession().catch(() => null);
  return getLiveFeed(session?.address ?? null, limit);
}

export async function getPostAction(id: string) {
  try {
    const session = await getSession().catch(() => null);
    const post = await getLivePost(id, session?.address ?? null);
    if (!post) return { ok: false as const, error: "POST_NOT_FOUND" };
    return { ok: true as const, post };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "POST_FAILED" };
  }
}

export async function getAuthorPostsAction(wallet: string, limit = 3) {
  try {
    const session = await getSession().catch(() => null);
    const posts = await getLivePostsByAuthor(wallet, session?.address ?? null, limit);
    return { ok: true as const, posts };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "AUTHOR_POSTS_FAILED" };
  }
}

export async function createPostAction(input: { caption: string; kind: "photo" | "video" | "text"; imageUrl?: string; coinId?: string }) {
  try {
    const session = await requireSession();
    const post = await createLivePost(session.address, input);
    revalidatePath("/home");
    revalidatePath("/explore");
    return { ok: true as const, post };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "CREATE_POST_FAILED" };
  }
}

export async function deletePostAction(id: string) {
  try {
    const session = await requireSession();
    const deleted = await deleteLivePost(session.address, id);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${deleted}`);
    return { ok: true as const, id: deleted };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "DELETE_POST_FAILED" };
  }
}
