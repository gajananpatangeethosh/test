// Echo contract addresses — ALL placeholders until contracts are deployed.
// Set via environment; never hardcode addresses here.
export const ADDRESSES = {
  creatorFactory: process.env.NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS || "",
  postFactory: process.env.NEXT_PUBLIC_POST_FACTORY_ADDRESS || "",
  /** Plan C: ERC-721 collectible + ERC-20 coin in one tx. */
  postFactoryV2: process.env.NEXT_PUBLIC_POST_FACTORY_V2_ADDRESS || "",
  postNft: process.env.NEXT_PUBLIC_POST_NFT_ADDRESS || "",
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "",
} as const;
