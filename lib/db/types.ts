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
