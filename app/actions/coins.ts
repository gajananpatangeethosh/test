"use server";

import { revalidatePath } from "next/cache";
import {
  getLiveCoin,
  getMyLiveCoin,
  listLiveCoinTrades,
  listLiveCoins,
  recordCoinMint,
  tradeLiveCoin,
} from "@/lib/db/dal";
import { getSession, requireSession } from "@/lib/db/session";

export async function getMarketsAction() {
  const session = await getSession().catch(() => null);
  return listLiveCoins(session?.address ?? null);
}

export async function getCoinAction(id: string) {
  try {
    const session = await getSession().catch(() => null);
    const coin = await getLiveCoin(id, session?.address ?? null);
    if (!coin) return { ok: false as const, error: "COIN_NOT_FOUND" };
    const trades = await listLiveCoinTrades(id, 30);
    return { ok: true as const, coin, trades };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "COIN_FAILED" };
  }
}

/** The signed-in user's own creator coin. Created for them on signup. */
export async function getMyCoinAction() {
  try {
    const session = await requireSession();
    const coin = await getMyLiveCoin(session.address);
    if (!coin) return { ok: false as const, error: "COIN_NOT_FOUND" };
    return { ok: true as const, coin };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "MY_COIN_FAILED" };
  }
}

export async function tradeCoinAction(input: {
  coinId: string;
  side: "buy" | "sell";
  amount: number;
}) {
  try {
    const session = await requireSession();
    const result = await tradeLiveCoin(session.address, input.coinId, input.side, input.amount);
    revalidatePath("/markets");
    revalidatePath(`/coins/${input.coinId}`);
    return { ok: true as const, result };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "TRADE_FAILED" };
  }
}

/** Owner-only mint bookkeeping, for when the CreatorFactory ships. */
export async function recordCoinMintAction(input: {
  coinId: string;
  status: "minting" | "minted" | "failed";
  txHash?: string;
  tokenAddress?: string;
  tokenId?: string;
  error?: string;
}) {
  try {
    const session = await requireSession();
    const coin = await recordCoinMint(session.address, input.coinId, input);
    revalidatePath(`/coins/${input.coinId}`);
    revalidatePath("/markets");
    return { ok: true as const, coin };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "MINT_STATUS_FAILED" };
  }
}
