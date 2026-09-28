"use server";

import { appendOrbitMessage, createOrbitConversation, getOrbitConversation, listOrbitConversations } from "@/lib/db/dal";
import { requireSession } from "@/lib/db/session";

export async function listOrbitConversationsAction() {
  try {
    const session = await requireSession();
    const conversations = await listOrbitConversations(session.address);
    return { ok: true as const, conversations };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "ORBIT_HISTORY_FAILED" };
  }
}

export async function createOrbitConversationAction(title?: string) {
  try {
    const session = await requireSession();
    const conversation = await createOrbitConversation(session.address, title);
    return { ok: true as const, conversation };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "ORBIT_CONVERSATION_FAILED" };
  }
}

export async function getOrbitConversationAction(id: string) {
  try {
    const session = await requireSession();
    const thread = await getOrbitConversation(session.address, id);
    if (!thread) return { ok: false as const, error: "ORBIT_CONVERSATION_NOT_FOUND" };
    return { ok: true as const, ...thread };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "ORBIT_HISTORY_FAILED" };
  }
}

export async function appendOrbitMessageAction(
  conversationId: string,
  input: { role: "user" | "assistant"; content: string; model?: string },
) {
  try {
    const session = await requireSession();
    const message = await appendOrbitMessage(session.address, conversationId, input);
    return { ok: true as const, message };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "ORBIT_MESSAGE_FAILED" };
  }
}
