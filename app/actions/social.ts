"use server";

import { revalidatePath } from "next/cache";
import { addLiveComment, deleteLiveComment, listLiveComments, toggleLikePost } from "@/lib/db/dal";
import { getSession, requireSession } from "@/lib/db/session";

export async function toggleLikeAction(postId: string) {
  try {
    const session = await requireSession();
    const result = await toggleLikePost(session.address, postId);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${postId}`);
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "LIKE_FAILED" };
  }
}

export async function listCommentsAction(postId: string) {
  try {
    const session = await getSession().catch(() => null);
    const comments = await listLiveComments(postId, session?.address ?? null);
    return { ok: true as const, comments };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "COMMENTS_FAILED" };
  }
}

export async function addCommentAction(postId: string, body: string) {
  try {
    const session = await requireSession();
    const result = await addLiveComment(session.address, postId, body);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${postId}`);
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "COMMENT_FAILED" };
  }
}

export async function deleteCommentAction(commentId: string) {
  try {
    const session = await requireSession();
    const result = await deleteLiveComment(session.address, commentId);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${result.postId}`);
    return { ok: true as const, ...result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "COMMENT_DELETE_FAILED" };
  }
}
