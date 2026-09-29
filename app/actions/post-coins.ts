"use server";

import { revalidatePath } from "next/cache";
import { getPostCoinByPostId, recordPostCoinMint, recordPostNftMint, tradeLivePostCoin } from "@/lib/db/dal";
import { getSession, requireSession } from "@/lib/db/session";

export async function getPostCoinAction(postId: string) {
  try {
    const session = await getSession().catch(() => null);
    const coin = await getPostCoinByPostId(postId, session?.address ?? null);
    if (!coin) return { ok: false as const, error: "POST_COIN_NOT_FOUND" };
    return { ok: true as const, coin };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "POST_COIN_FAILED" };
  }
}

export async function buyPostCoinAction(input: { coinId: string; amountMst: number }) {
  try {
    const session = await requireSession();
    const result = await tradeLivePostCoin(session.address, input.coinId, "buy", input.amountMst);
    revalidatePath("/home");
    revalidatePath("/explore");
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "BUY_FAILED" };
  }
}

export async function recordPostNftMintAction(input: { coinId: string; txHash: string; tokenId: string }) {
  try {
    const session = await requireSession();
    const coin = await recordPostNftMint(session.address, input.coinId, input);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${coin?.postId ?? ""}`);
    return { ok: true as const, coin };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "NFT_MINT_STATUS_FAILED" };
  }
}

export async function recordPostCoinMintAction(input: {
  coinId: string;
  status: "minting" | "minted" | "failed";
  txHash?: string;
  tokenAddress?: string;
  tokenId?: string;
  error?: string;
}) {
  try {
    const session = await requireSession();
    const coin = await recordPostCoinMint(session.address, input.coinId, input);
    revalidatePath("/home");
    revalidatePath("/explore");
    revalidatePath(`/post/${coin?.postId ?? ""}`);
    return { ok: true as const, coin };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "MINT_STATUS_FAILED" };
  }
}
