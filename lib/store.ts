import { create } from "zustand";
import type { MarketCoin } from "./markets";
import type { PostCoinInfo } from "./db/types";
type TradeTarget = { coin: MarketCoin; side: "buy" | "sell" } | null;
type CollectTarget = { postId: string; postCoin: PostCoinInfo; creatorUsername: string } | null;
type Store = {
  likes: Record<string, boolean>; follows: Record<string, boolean>;
  tradeModal: TradeTarget; collectPost: CollectTarget;
  /** Bumped after a live trade so pages can refetch without a prop chain. */
  tradeTick: number;
  toggleLike: (id: string) => void; toggleFollow: (u: string) => void;
  openTrade: (coin: MarketCoin, side: "buy" | "sell") => void; closeTrade: () => void;
  openCollect: (postId: string, postCoin: PostCoinInfo, creatorUsername: string) => void; closeCollect: () => void;
  setTradeTick: (n: number) => void;
};
export const useApp = create<Store>((set) => ({
  likes: {}, follows: { gajanan: true, anaya: true },
  tradeModal: null, collectPost: null,
  tradeTick: 0,
  toggleLike: (id) => set((s) => ({ likes: { ...s.likes, [id]: !s.likes[id] } })),
  toggleFollow: (u) => set((s) => ({ follows: { ...s.follows, [u]: !s.follows[u] } })),
  openTrade: (coin, side) => set({ tradeModal: { coin, side } }),
  closeTrade: () => set({ tradeModal: null }),
  openCollect: (postId, postCoin, creatorUsername) => set({ collectPost: { postId, postCoin, creatorUsername } }),
  closeCollect: () => set({ collectPost: null }),
  setTradeTick: (n) => set({ tradeTick: n }),
}));
