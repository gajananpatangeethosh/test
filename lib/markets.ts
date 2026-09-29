// Client-safe market model. Mirrors lib/feed.ts: mock coins from lib/data.ts
// are tagged source: "mock"; Supabase coins are source: "live". The UI must
// render the source badge, and mock ids must never be sent to Server Actions.

import { coins as mockCoins, holdings as mockHoldings, type Coin } from "./data";
import type { LiveCoin, LiveCoinTrade } from "./db/types";
import { CONTRACT_ADDRESSES, isContractDeployed } from "./mst/config";

export type CoinSource = "live" | "mock";
export type MintStatus = "pending" | "minting" | "minted" | "failed";
export type Settlement = "offchain" | "onchain";

export type MarketCoin = {
  id: string;
  name: string;
  symbol: string;
  creatorUsername: string;
  ownerWallet: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holders: number;
  spark: number[];
  source: CoinSource;
  createdAt: string;
  mintStatus: MintStatus;
  settlement: Settlement;
  chainId: string | null;
  tokenAddress: string | null;
  viewerHolding: number;
  reserveMst?: number;
  poolSupply?: number;
  initialSupply?: number;
};

export type MarketTrade = {
  id: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  totalMst: number;
  createdAt: string;
  traderUsername: string;
  source: CoinSource;
};


function mockHolding(coinId: string): number {
  return mockHoldings.find((h) => h.coinId === coinId)?.amount ?? 0;
}

export function toMockMarketCoin(coin: Coin): MarketCoin {
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    creatorUsername: coin.creator,
    ownerWallet: "",
    price: coin.price,
    change24h: coin.change24h,
    volume24h: coin.volume24h,
    marketCap: coin.marketCap,
    liquidity: coin.liquidity,
    holders: coin.holders,
    spark: coin.spark,
    source: "mock",
    createdAt: coin.createdAt,
    mintStatus: "pending",
    settlement: "offchain",
    chainId: null,
    tokenAddress: null,
    viewerHolding: mockHolding(coin.id),
  };
}

export function mockMarketCoins(): MarketCoin[] {
  return mockCoins.map(toMockMarketCoin);
}

export function mockMarketCoinById(id: string): MarketCoin | null {
  const coin = mockCoins.find((c) => c.id === id);
  return coin ? toMockMarketCoin(coin) : null;
}

export function fromLiveCoin(coin: LiveCoin): MarketCoin {
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    creatorUsername: coin.creatorUsername,
    ownerWallet: coin.ownerWallet,
    price: coin.price,
    change24h: coin.change24h,
    volume24h: coin.volume24h,
    marketCap: coin.marketCap,
    liquidity: coin.liquidity,
    holders: coin.holders,
    spark: coin.spark,
    source: "live",
    createdAt: coin.createdAt,
    mintStatus: coin.mintStatus,
    settlement: coin.settlement,
    chainId: coin.chainId,
    tokenAddress: coin.tokenAddress,
    viewerHolding: coin.viewerHolding,
    reserveMst: coin.reserveMst,
    poolSupply: coin.poolSupply,
    initialSupply: coin.totalSupply,
  };
}

export function fromLiveCoinTrade(trade: LiveCoinTrade): MarketTrade {
  return {
    id: trade.id,
    side: trade.side,
    amount: trade.amount,
    price: trade.price,
    totalMst: trade.totalMst,
    createdAt: trade.createdAt,
    traderUsername: trade.traderUsername,
    source: "live",
  };
}

export function isLiveCoin(coin: MarketCoin): boolean {
  return coin.source === "live";
}

/** A coin is only really an NFT once a chain transaction backs it. */
export function isOnChain(coin: MarketCoin): boolean {
  return coin.mintStatus === "minted" && !!coin.tokenAddress;
}

export function isMarketplaceDeployed(): boolean {
  return isContractDeployed(CONTRACT_ADDRESSES.marketplace);
}

/** Live buys/sells that should route through BridgeKey + the MST Marketplace. */
export function usesBridgeKeyTrades(coin: MarketCoin): boolean {
  return isLiveCoin(coin) && isMarketplaceDeployed() && isOnChain(coin);
}

export function coinSourceLabel(source: CoinSource): string {
  return source === "live" ? "Live" : "Mock sample";
}

export function mintLabel(status: MintStatus): string {
  if (status === "minted") return "Minted on MST";
  if (status === "minting") return "Minting…";
  if (status === "failed") return "Mint failed";
  return "Mint pending";
}
