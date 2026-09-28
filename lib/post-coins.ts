// Client-safe post coin model for feed cards and buy modals.

import type { LivePostCoin, MintStatus, PostCoinInfo } from "./db/types";
import type { MarketCoin } from "./markets";
import { CONTRACT_ADDRESSES, isContractDeployed } from "./mst/config";

export function isPostCoinOnChain(coin: PostCoinInfo | LivePostCoin): boolean {
  return coin.mintStatus === "minted" && !!coin.tokenAddress;
}

export function isPostMarketplaceDeployed(): boolean {
  return isContractDeployed(CONTRACT_ADDRESSES.marketplace);
}

export function usesBridgeKeyPostBuy(coin: PostCoinInfo | LivePostCoin): boolean {
  return isPostMarketplaceDeployed() && isPostCoinOnChain(coin);
}

export function toMarketCoinFromPostCoin(coin: PostCoinInfo | LivePostCoin, creatorUsername: string): MarketCoin {
  const live = coin as LivePostCoin;
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    creatorUsername,
    ownerWallet: coin.ownerWallet,
    price: coin.price,
    change24h: coin.change24h,
    volume24h: live.volume24h ?? 0,
    marketCap: coin.price * (live.totalSupply ?? 10000),
    liquidity: live.reserveMst ?? 100,
    holders: live.holders ?? 1,
    spark: [],
    source: "live",
    createdAt: live.createdAt ?? new Date().toISOString(),
    mintStatus: coin.mintStatus,
    settlement: coin.tokenAddress ? "onchain" : "offchain",
    chainId: live.chainId ?? null,
    tokenAddress: coin.tokenAddress,
    viewerHolding: coin.viewerHolding,
  };
}

export function mintLabel(status: MintStatus): string {
  if (status === "minted") return "Minted on MST";
  if (status === "minting") return "Minting…";
  if (status === "failed") return "Mint failed";
  return "Mint pending";
}
