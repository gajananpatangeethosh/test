// Client-safe feed model. Mock rows from lib/data.ts are explicitly tagged
// source: "mock"; rows from Supabase are source: "live". UI must render the
// source badge and must never send mock ids to Server Actions.

import { creatorByName, posts, type Post } from "./data";
import type { FeedPost as DbFeedPost, PostCoinInfo } from "./db/types";

export type FeedSource = "live" | "mock";

export type FeedAuthor = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
  wallet: string | null;
};

export type FeedPost = Post & {
  source: FeedSource;
  authorWallet: string | null;
  author: FeedAuthor;
  viewerLiked?: boolean;
  postCoin?: PostCoinInfo;
};

export function toMockFeedPost(post: Post): FeedPost {
  const creator = creatorByName(post.creator);
  return {
    ...post,
    source: "mock",
    authorWallet: null,
    author: {
      username: creator.username,
      displayName: creator.name,
      avatarUrl: null,
      verified: creator.verified,
      wallet: null,
    },
  };
}

export function mockFeedPosts(): FeedPost[] {
  return posts.map(toMockFeedPost);
}

export function fromLiveFeedPost(post: DbFeedPost): FeedPost {
  return {
    ...post,
    source: "live",
    authorWallet: post.authorWallet,
    author: {
      username: post.creator,
      displayName: post.authorDisplayName,
      avatarUrl: post.authorAvatarUrl,
      verified: post.authorVerified,
      wallet: post.authorWallet,
    },
    viewerLiked: post.viewerLiked,
    postCoin: post.postCoin,
  };
}

export function sourceLabel(source: FeedSource): string {
  return source === "live" ? "Live" : "Mock sample";
}
