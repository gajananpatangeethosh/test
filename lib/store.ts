import { create } from "zustand";
type TradeTarget = { coinId: string; side: "buy" | "sell" } | null;
type Store = {
  likes: Record<string, boolean>; follows: Record<string, boolean>;
  tradeModal: TradeTarget; collectPost: string | null;
  toggleLike: (id: string) => void; toggleFollow: (u: string) => void;
  openTrade: (coinId: string, side: "buy" | "sell") => void; closeTrade: () => void;
  openCollect: (id: string) => void; closeCollect: () => void;
};
export const useApp = create<Store>((set) => ({
  likes: {}, follows: { gajanan: true, anaya: true },
  tradeModal: null, collectPost: null,
  toggleLike: (id) => set((s) => ({ likes: { ...s.likes, [id]: !s.likes[id] } })),
  toggleFollow: (u) => set((s) => ({ follows: { ...s.follows, [u]: !s.follows[u] } })),
  openTrade: (coinId, side) => set({ tradeModal: { coinId, side } }),
  closeTrade: () => set({ tradeModal: null }),
  openCollect: (id) => set({ collectPost: id }),
  closeCollect: () => set({ collectPost: null }),
}));
