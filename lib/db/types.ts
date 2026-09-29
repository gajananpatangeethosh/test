// Server DTOs. Phone numbers never leave the server except for the owner.

export type ProfilePublic = {
  wallet: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  location: string | null;
  verified: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  joinedAt: string | null;
};

export type ProfilePrivate = ProfilePublic & { phone: string | null };

export type PostCoinInfo = {
  id: string;
  postId: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  mintStatus: MintStatus;
  tokenAddress: string | null;
  /** ERC-721 token id in the PostNFT collection (Plan C). */
  nftTokenId: string | null;
  ownerWallet: string;
  viewerHolding: number;
  reserveMst?: number;
  poolSupply?: number;
};

export type FeedPost = {
  source: "live";
  id: string;
  creator: string;
  time: string;
  caption: string;
  image?: string;
  kind: "photo" | "video" | "text";
  likes: number;
  comments: number;
  shares: number;
  coinId?: string;
  collects: number;
  authorWallet: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  viewerLiked: boolean;
  postCoin?: PostCoinInfo;
};

export type LivePostCoin = {
  id: string;
  postId: string;
  name: string;
  symbol: string;
  ownerWallet: string;
  price: number;
  change24h: number;
  volume24h: number;
  holders: number;
  reserveMst: number;
  totalSupply: number;
  mintStatus: MintStatus;
  mintTxHash: string | null;
  mintError: string | null;
  chainId: string | null;
  tokenAddress: string | null;
  nftTokenId: string | null;
  settlement: Settlement;
  viewerHolding: number;
  createdAt: string;
};

export type LivePostCoinTradeResult = {
  side: "buy" | "sell";
  amount: number;
  totalMst: number;
  price: number;
  holding: number;
};

export type DbComment = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  authorWallet: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  mine: boolean;
};

export type MintStatus = "pending" | "minting" | "minted" | "failed";
export type Settlement = "offchain" | "onchain";

/** One creator coin. marketCap = price x initial supply (10k units), see dal.ts. */
export type LiveCoin = {
  id: string;
  name: string;
  symbol: string;
  ownerWallet: string;
  creatorUsername: string;
  creatorDisplayName: string;
  creatorAvatarUrl: string | null;
  creatorVerified: boolean;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holders: number;
  spark: number[];
  reserveMst: number;
  poolSupply: number;
  totalSupply: number;
  mintStatus: MintStatus;
  mintTxHash: string | null;
  mintError: string | null;
  chainId: string | null;
  tokenAddress: string | null;
  tokenId: string | null;
  settlement: Settlement;
  viewerHolding: number;
  createdAt: string;
};

export type LiveCoinTrade = {
  id: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  totalMst: number;
  settlement: Settlement;
  createdAt: string;
  traderUsername: string;
};

export type LiveCoinTradeResult = {
  side: "buy" | "sell";
  amount: number;
  totalMst: number;
  price: number;
  holding: number;
};

export type OrbitConversation = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export type OrbitMessage = {
  role: "user" | "assistant";
  content: string;
  model: string | null;
  seq: number;
  createdAt: string;
};

export type LiveResult<T> = { data: T; liveError: string | null };
