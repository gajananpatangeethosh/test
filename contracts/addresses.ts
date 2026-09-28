// MSTORA contract addresses — ALL placeholders until contracts are deployed.
// Set via environment; never hardcode addresses here.
export const ADDRESSES = {
  creatorFactory: process.env.NEXT_PUBLIC_CREATOR_FACTORY_ADDRESS || "",
  postFactory: process.env.NEXT_PUBLIC_POST_FACTORY_ADDRESS || "",
  marketplace: process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "",
} as const;
