// Server-only Data Access Layer.
// Every function takes an explicit viewer/actor wallet. Authentication happens in
// Server Actions and Route Handlers; this module never reads cookies itself.

import { isMissingTable, serviceClient } from "./client";
import { COIN_INITIAL_PRICE } from "@/lib/bonding-curve";
import {
  normalizeCaption,
  normalizeCommentBody,
  normalizePhone,
  normalizePostKind,
  normalizeUsername,
  normalizeWalletInput,
} from "./wallets";
import type {
  DbComment,
  FeedPost,
  LiveCoin,
  LiveCoinTrade,
  LiveCoinTradeResult,
  LivePostCoin,
  LivePostCoinTradeResult,
  LiveResult,
  MintStatus,
  OrbitConversation,
  OrbitMessage,
  PostCoinInfo,
  ProfilePrivate,
  ProfilePublic,
} from "./types";

type ProfileRow = {
  wallet_address: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  location: string | null;
  verified: boolean;
  follower_count: number;
  following_count: number;
  joined_at: string | null;
  phone?: string | null;
};

type PostRow = {
  id: string;
  author_wallet: string;
  caption: string;
  kind: "photo" | "video" | "text";
  image_url: string | null;
  coin_id: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  created_at: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_wallet: string;
  body: string;
  created_at: string;
};

type ConversationRow = { id: string; title: string | null; updated_at: string };
type MessageRow = {
  role: "user" | "assistant";
  content: string;
  model: string | null;
  seq: number;
  created_at: string;
};

function mustData<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    const message = (result.error as { message?: unknown }).message;
    throw new Error(typeof message === "string" && message ? message : `${what}_FAILED`);
  }
  if (result.data === null || result.data === undefined) throw new Error(`${what}_NOT_FOUND`);
  return result.data;
}

function toPublicProfile(row: ProfileRow, postCount: number): ProfilePublic {
  return {
    wallet: row.wallet_address,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    location: row.location,
    verified: row.verified,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    postCount,
    joinedAt: row.joined_at,
  };
}

function toFeedPost(row: PostRow, author: ProfileRow, viewerLiked: boolean, postCoin?: PostCoinInfo): FeedPost {
  const post: FeedPost = {
    source: "live",
    id: row.id,
    creator: author.username,
    time: row.created_at,
    caption: row.caption,
    kind: row.kind,
    likes: row.like_count,
    comments: row.comment_count,
    shares: row.share_count,
    collects: row.collect_count,
    authorWallet: row.author_wallet,
    authorDisplayName: author.display_name,
    authorAvatarUrl: author.avatar_url,
    authorVerified: author.verified,
    viewerLiked,
  };
  if (row.image_url) post.image = row.image_url;
  if (row.coin_id) post.coinId = row.coin_id;
  if (postCoin) post.postCoin = postCoin;
  return post;
}

async function postCountFor(wallet: string): Promise<number> {
  const sb = serviceClient();
  const result = await sb.from("posts").select("id", { count: "exact", head: true }).eq("author_wallet", wallet);
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_COUNT_FAILED");
  }
  return result.count ?? 0;
}

async function requireProfileRow(walletInput: string): Promise<ProfileRow> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const result = await sb
    .from("profiles")
    .select("wallet_address,username,display_name,bio,avatar_url,location,verified,follower_count,following_count,joined_at")
    .eq("wallet_address", wallet)
    .maybeSingle();
  const row = mustData(result as { data: ProfileRow | null; error: unknown }, "PROFILE");
  if (!row) throw new Error("PROFILE_REQUIRED");
  return row;
}

export async function getLiveFeed(viewer: string | null, limit = 30): Promise<LiveResult<FeedPost[]>> {
  try {
    const sb = serviceClient();
    const posts = mustData(
      (await sb
        .from("posts")
        .select("id,author_wallet,caption,kind,image_url,coin_id,like_count,comment_count,share_count,collect_count,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(limit, 1), 100))) as { data: PostRow[] | null; error: unknown },
      "FEED",
    );
    if (posts.length === 0) return { data: [], liveError: null };
    const wallets = Array.from(new Set(posts.map((p) => p.author_wallet)));
    const authors = mustData(
      (await sb
        .from("profiles")
        .select("wallet_address,username,display_name,bio,avatar_url,location,verified,follower_count,following_count,joined_at")
        .in("wallet_address", wallets)) as { data: ProfileRow[] | null; error: unknown },
      "FEED_AUTHORS",
    );
    const byWallet = new Map(authors.map((a) => [a.wallet_address, a]));
    let liked = new Set<string>();
    if (viewer) {
      const likes = mustData(
        (await sb
          .from("likes")
          .select("post_id")
          .eq("profile_wallet", normalizeWalletInput(viewer))
          .in(
            "post_id",
            posts.map((p) => p.id),
          )) as { data: { post_id: string }[] | null; error: unknown },
        "FEED_LIKES",
      );
      liked = new Set(likes.map((l) => l.post_id));
    }
    const postCoins = await loadPostCoinInfoByPostIds(posts.map((p) => p.id), viewer);
    const feed: FeedPost[] = [];
    for (const post of posts) {
      const author = byWallet.get(post.author_wallet);
      if (!author) continue;
      feed.push(toFeedPost(post, author, liked.has(post.id), postCoins.get(post.id)));
    }
    return { data: feed, liveError: null };
  } catch (e) {
    if (e instanceof Error && (e.message === "DB_NOT_READY" || e.message.startsWith("DB_NOT_CONFIGURED"))) {
      return { data: [], liveError: e.message };
    }
    throw e;
  }
}

export async function getLivePost(postId: string, viewer: string | null): Promise<FeedPost | null> {
  const sb = serviceClient();
  const postResult = await sb
    .from("posts")
    .select("id,author_wallet,caption,kind,image_url,coin_id,like_count,comment_count,share_count,collect_count,created_at")
    .eq("id", postId)
    .maybeSingle();
  if (postResult.error) {
    if (isMissingTable(postResult.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_FAILED");
  }
  const post = postResult.data as PostRow | null;
  if (!post) return null;
  const author = await requireProfileRow(post.author_wallet);
  let viewerLiked = false;
  if (viewer) {
    const like = await sb
      .from("likes")
      .select("post_id")
      .eq("profile_wallet", normalizeWalletInput(viewer))
      .eq("post_id", post.id)
      .maybeSingle();
    if (like.error) throw new Error("LIKE_STATUS_FAILED");
    viewerLiked = !!(like.data as { post_id: string } | null);
  }
  const postCoins = await loadPostCoinInfoByPostIds([post.id], viewer);
  return toFeedPost(post, author, viewerLiked, postCoins.get(post.id));
}

export async function getLivePostsByAuthor(walletInput: string, viewer: string | null, limit = 20): Promise<FeedPost[]> {
  const wallet = normalizeWalletInput(walletInput);
  const author = await requireProfileRow(wallet);
  const sb = serviceClient();
  const posts = mustData(
    (await sb
      .from("posts")
      .select("id,author_wallet,caption,kind,image_url,coin_id,like_count,comment_count,share_count,collect_count,created_at")
      .eq("author_wallet", wallet)
      .order("created_at", { ascending: false })
      .limit(limit)) as { data: PostRow[] | null; error: unknown },
    "AUTHOR_POSTS",
  );
  let liked = new Set<string>();
  if (viewer && posts.length > 0) {
    const likes = mustData(
      (await sb
        .from("likes")
        .select("post_id")
        .eq("profile_wallet", normalizeWalletInput(viewer))
        .in(
          "post_id",
          posts.map((p) => p.id),
        )) as { data: { post_id: string }[] | null; error: unknown },
      "AUTHOR_LIKES",
    );
    liked = new Set(likes.map((l) => l.post_id));
  }
  const postCoins = await loadPostCoinInfoByPostIds(posts.map((p) => p.id), viewer);
  return posts.map((p) => toFeedPost(p, author, liked.has(p.id), postCoins.get(p.id)));
}

export async function getLiveProfilePage(
  usernameInput: string,
  viewer: string | null,
): Promise<{ profile: ProfilePublic; posts: FeedPost[]; viewerFollowing: boolean } | null> {
  const username = normalizeUsername(usernameInput);
  const sb = serviceClient();
  const profileResult = await sb
    .from("profiles")
    .select("wallet_address,username,display_name,bio,avatar_url,location,verified,follower_count,following_count,joined_at")
    .eq("username", username)
    .maybeSingle();
  if (profileResult.error) {
    if (isMissingTable(profileResult.error)) throw new Error("DB_NOT_READY");
    throw new Error("PROFILE_FAILED");
  }
  const row = profileResult.data as ProfileRow | null;
  if (!row) return null;
  const posts = await getLivePostsByAuthor(row.wallet_address, viewer, 20);
  const postCount = await postCountFor(row.wallet_address);
  let viewerFollowing = false;
  if (viewer && normalizeWalletInput(viewer) !== row.wallet_address) {
    const follow = await sb
      .from("follows")
      .select("followee_wallet")
      .eq("follower_wallet", normalizeWalletInput(viewer))
      .eq("followee_wallet", row.wallet_address)
      .maybeSingle();
    if (follow.error) throw new Error("FOLLOW_STATUS_FAILED");
    viewerFollowing = !!(follow.data as { followee_wallet: string } | null);
  }
  return { profile: toPublicProfile(row, postCount), posts, viewerFollowing };
}

export async function listLiveComments(postId: string, viewer: string | null, limit = 100): Promise<DbComment[]> {
  const sb = serviceClient();
  const comments = mustData(
    (await sb
      .from("comments")
      .select("id,post_id,author_wallet,body,created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .limit(limit)) as { data: CommentRow[] | null; error: unknown },
    "COMMENTS",
  );
  if (comments.length === 0) return [];
  const wallets = Array.from(new Set(comments.map((c) => c.author_wallet)));
  const authors = mustData(
    (await sb
      .from("profiles")
      .select("wallet_address,username,display_name,avatar_url")
      .in("wallet_address", wallets)) as {
      data: Pick<ProfileRow, "wallet_address" | "username" | "display_name" | "avatar_url">[] | null;
      error: unknown;
    },
    "COMMENT_AUTHORS",
  );
  const byWallet = new Map(authors.map((a) => [a.wallet_address, a]));
  const me = viewer ? normalizeWalletInput(viewer) : null;
  return comments.map((c) => {
    const author = byWallet.get(c.author_wallet);
    return {
      id: c.id,
      postId: c.post_id,
      body: c.body,
      createdAt: c.created_at,
      authorWallet: c.author_wallet,
      authorUsername: author?.username ?? "unknown",
      authorDisplayName: author?.display_name ?? "Unknown",
      authorAvatarUrl: author?.avatar_url ?? null,
      mine: me !== null && me === c.author_wallet,
    };
  });
}

export async function toggleLikePost(walletInput: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
  const wallet = normalizeWalletInput(walletInput);
  await requireProfileRow(wallet);
  const sb = serviceClient();
  const post = mustData(
    (await sb.from("posts").select("id").eq("id", postId).maybeSingle()) as {
      data: { id: string } | null;
      error: unknown;
    },
    "POST",
  );
  if (!post) throw new Error("POST_NOT_FOUND");
  const insert = await sb.from("likes").insert({ profile_wallet: wallet, post_id: postId });
  if (insert.error && (insert.error as { code?: string }).code !== "23505") {
    if (isMissingTable(insert.error)) throw new Error("DB_NOT_READY");
    throw new Error("LIKE_FAILED");
  }
  let liked = !insert.error;
  if (insert.error) {
    const del = await sb.from("likes").delete().eq("profile_wallet", wallet).eq("post_id", postId);
    if (del.error) throw new Error("UNLIKE_FAILED");
    liked = false;
  }
  const updated = mustData(
    (await sb.from("posts").select("like_count").eq("id", postId).maybeSingle()) as {
      data: { like_count: number } | null;
      error: unknown;
    },
    "POST",
  );
  return { liked, likeCount: updated.like_count };
}

export async function addLiveComment(walletInput: string, postId: string, bodyInput: unknown): Promise<{ comment: DbComment; commentCount: number }> {
  const wallet = normalizeWalletInput(walletInput);
  const author = await requireProfileRow(wallet);
  const body = normalizeCommentBody(bodyInput);
  const sb = serviceClient();
  const post = mustData(
    (await sb.from("posts").select("id").eq("id", postId).maybeSingle()) as {
      data: { id: string } | null;
      error: unknown;
    },
    "POST",
  );
  if (!post) throw new Error("POST_NOT_FOUND");
  const inserted = mustData(
    (await sb
      .from("comments")
      .insert({ post_id: postId, author_wallet: wallet, body })
      .select("id,post_id,author_wallet,body,created_at")
      .single()) as { data: CommentRow | null; error: unknown },
    "COMMENT",
  );
  const updated = mustData(
    (await sb.from("posts").select("comment_count").eq("id", postId).maybeSingle()) as {
      data: { comment_count: number } | null;
      error: unknown;
    },
    "POST",
  );
  return {
    comment: {
      id: inserted.id,
      postId: inserted.post_id,
      body: inserted.body,
      createdAt: inserted.created_at,
      authorWallet: wallet,
      authorUsername: author.username,
      authorDisplayName: author.display_name,
      authorAvatarUrl: author.avatar_url,
      mine: true,
    },
    commentCount: updated.comment_count,
  };
}

export async function deleteLiveComment(walletInput: string, commentId: string): Promise<{ postId: string; commentCount: number }> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const existing = mustData(
    (await sb.from("comments").select("id,post_id,author_wallet").eq("id", commentId).maybeSingle()) as {
      data: { id: string; post_id: string; author_wallet: string } | null;
      error: unknown;
    },
    "COMMENT",
  );
  if (!existing) throw new Error("COMMENT_NOT_FOUND");
  if (existing.author_wallet !== wallet) throw new Error("FORBIDDEN");
  const del = await sb.from("comments").delete().eq("id", commentId);
  if (del.error) throw new Error("COMMENT_DELETE_FAILED");
  const updated = mustData(
    (await sb.from("posts").select("comment_count").eq("id", existing.post_id).maybeSingle()) as {
      data: { comment_count: number } | null;
      error: unknown;
    },
    "POST",
  );
  return { postId: existing.post_id, commentCount: updated.comment_count };
}

export async function toggleFollowProfile(
  walletInput: string,
  usernameInput: string,
): Promise<{ following: boolean; followerCount: number }> {
  const wallet = normalizeWalletInput(walletInput);
  await requireProfileRow(wallet);
  const username = normalizeUsername(usernameInput);
  const sb = serviceClient();
  const targetResult = await sb
    .from("profiles")
    .select("wallet_address,follower_count")
    .eq("username", username)
    .maybeSingle();
  const target = mustData(targetResult as {
    data: { wallet_address: string; follower_count: number } | null;
    error: unknown;
  }, "PROFILE");
  if (!target) throw new Error("PROFILE_NOT_FOUND");
  if (target.wallet_address === wallet) throw new Error("CANNOT_FOLLOW_SELF");
  const insert = await sb.from("follows").insert({ follower_wallet: wallet, followee_wallet: target.wallet_address });
  if (insert.error && (insert.error as { code?: string }).code !== "23505") throw new Error("FOLLOW_FAILED");
  let following = !insert.error;
  if (insert.error) {
    const del = await sb.from("follows").delete().eq("follower_wallet", wallet).eq("followee_wallet", target.wallet_address);
    if (del.error) throw new Error("UNFOLLOW_FAILED");
    following = false;
  }
  const updated = mustData(
    (await sb.from("profiles").select("follower_count").eq("wallet_address", target.wallet_address).maybeSingle()) as {
      data: { follower_count: number } | null;
      error: unknown;
    },
    "PROFILE",
  );
  return { following, followerCount: updated.follower_count };
}

export async function upsertProfile(
  walletInput: string,
  input: {
    username: unknown;
    displayName?: unknown;
    bio?: unknown;
    phone?: unknown;
    avatarUrl?: unknown;
    location?: unknown;
  },
): Promise<ProfilePrivate> {
  const wallet = normalizeWalletInput(walletInput);
  const username = normalizeUsername(input.username);
  const displayName = typeof input.displayName === "string" && input.displayName.trim() ? input.displayName.trim().slice(0, 80) : username;
  const bio = typeof input.bio === "string" ? input.bio.trim().slice(0, 500) : "";
  const phone = normalizePhone(input.phone);
  const avatarUrl = typeof input.avatarUrl === "string" && input.avatarUrl.trim() ? input.avatarUrl.trim().slice(0, 1000) : null;
  const location = typeof input.location === "string" && input.location.trim() ? input.location.trim().slice(0, 120) : null;
  const sb = serviceClient();
  const taken = await sb.from("profiles").select("wallet_address").eq("username", username).maybeSingle();
  if (taken.error) {
    if (isMissingTable(taken.error)) throw new Error("DB_NOT_READY");
    throw new Error("USERNAME_CHECK_FAILED");
  }
  const owner = taken.data as { wallet_address: string } | null;
  if (owner && owner.wallet_address !== wallet) throw new Error("USERNAME_TAKEN");
  const saved = mustData(
    (await sb
      .from("profiles")
      .upsert(
        {
          wallet_address: wallet,
          username,
          display_name: displayName,
          bio,
          phone,
          avatar_url: avatarUrl,
          location,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "wallet_address" },
      )
      .select("wallet_address,username,display_name,bio,avatar_url,location,verified,follower_count,following_count,joined_at,phone")
      .single()) as { data: ProfileRow | null; error: unknown },
    "PROFILE",
  );
  return { ...toPublicProfile(saved, await postCountFor(wallet)), phone: saved.phone ?? null };
}

export async function getPrivateProfile(walletInput: string): Promise<ProfilePrivate | null> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const result = await sb
    .from("profiles")
    .select("wallet_address,username,display_name,bio,avatar_url,location,verified,follower_count,following_count,joined_at,phone")
    .eq("wallet_address", wallet)
    .maybeSingle();
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    throw new Error("PROFILE_FAILED");
  }
  const row = result.data as ProfileRow | null;
  if (!row) return null;
  return { ...toPublicProfile(row, await postCountFor(wallet)), phone: row.phone ?? null };
}

export async function createLivePost(
  walletInput: string,
  input: { caption: unknown; kind: unknown; imageUrl?: unknown; coinId?: unknown },
): Promise<FeedPost> {
  const wallet = normalizeWalletInput(walletInput);
  const author = await requireProfileRow(wallet);
  const caption = normalizeCaption(input.caption);
  const kind = normalizePostKind(input.kind);
  const imageUrl = typeof input.imageUrl === "string" && input.imageUrl.trim() ? input.imageUrl.trim() : null;
  if (kind === "photo" && !imageUrl) throw new Error("POST_IMAGE_REQUIRED");
  const coinId = typeof input.coinId === "string" && input.coinId.trim() ? input.coinId.trim().slice(0, 120) : null;
  const sb = serviceClient();
  const inserted = mustData(
    (await sb
      .from("posts")
      .insert({
        id: crypto.randomUUID(),
        author_wallet: wallet,
        caption,
        kind,
        image_url: imageUrl,
        coin_id: coinId,
      })
      .select("id,author_wallet,caption,kind,image_url,coin_id,like_count,comment_count,share_count,collect_count,created_at")
      .single()) as { data: PostRow | null; error: unknown },
    "POST",
  );
  const ensured = await sb.rpc("ensure_post_coin", { p_post_id: inserted.id });
  if (ensured.error) {
    await sb.from("posts").delete().eq("id", inserted.id);
    if (isMissingTable(ensured.error)) throw new Error("DB_NOT_READY");
    const detail = String((ensured.error as { message?: string }).message ?? "");
    throw new Error(detail.includes("ensure_post_coin") ? "POST_COIN_FAILED" : `POST_COIN_FAILED: ${detail.slice(0, 120)}`);
  }
  const liveCoin = await getPostCoinByPostId(inserted.id, wallet);
  if (!liveCoin) {
    await sb.from("posts").delete().eq("id", inserted.id);
    throw new Error("POST_COIN_FAILED");
  }
  const postCoin = toPostCoinInfo(liveCoin);
  return toFeedPost(inserted, author, false, postCoin);
}

export async function deleteLivePost(walletInput: string, postId: string): Promise<string> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const existing = mustData(
    (await sb.from("posts").select("id,author_wallet").eq("id", postId).maybeSingle()) as {
      data: { id: string; author_wallet: string } | null;
      error: unknown;
    },
    "POST",
  );
  if (!existing) throw new Error("POST_NOT_FOUND");
  if (existing.author_wallet !== wallet) throw new Error("FORBIDDEN");
  const del = await sb.from("posts").delete().eq("id", postId);
  if (del.error) throw new Error("POST_DELETE_FAILED");
  return postId;
}

export async function listOrbitConversations(walletInput: string): Promise<OrbitConversation[]> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const rows = mustData(
    (await sb
      .from("orbit_conversations")
      .select("id,title,updated_at")
      .eq("profile_wallet", wallet)
      .order("updated_at", { ascending: false })
      .limit(50)) as { data: ConversationRow[] | null; error: unknown },
    "ORBIT_CONVERSATIONS",
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export async function createOrbitConversation(walletInput: string, titleInput?: unknown): Promise<OrbitConversation> {
  const wallet = normalizeWalletInput(walletInput);
  await requireProfileRow(wallet);
  const title = typeof titleInput === "string" && titleInput.trim() ? titleInput.trim().slice(0, 120) : null;
  const sb = serviceClient();
  const row = mustData(
    (await sb
      .from("orbit_conversations")
      .insert({ profile_wallet: wallet, title })
      .select("id,title,updated_at")
      .single()) as { data: ConversationRow | null; error: unknown },
    "ORBIT_CONVERSATION",
  );
  return { id: row.id, title: row.title, updatedAt: row.updated_at };
}

export async function getOrbitConversation(
  walletInput: string,
  conversationId: string,
): Promise<{ conversation: OrbitConversation; messages: OrbitMessage[] } | null> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const convResult = await sb
    .from("orbit_conversations")
    .select("id,title,updated_at")
    .eq("id", conversationId)
    .eq("profile_wallet", wallet)
    .maybeSingle();
  if (convResult.error) {
    if (isMissingTable(convResult.error)) throw new Error("DB_NOT_READY");
    throw new Error("ORBIT_CONVERSATION_FAILED");
  }
  const conv = convResult.data as ConversationRow | null;
  if (!conv) return null;
  const messages = mustData(
    (await sb
      .from("orbit_messages")
      .select("role,content,model,seq,created_at")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: true })
      .limit(200)) as { data: MessageRow[] | null; error: unknown },
    "ORBIT_MESSAGES",
  );
  return {
    conversation: { id: conv.id, title: conv.title, updatedAt: conv.updated_at },
    messages: messages.map((m) => ({ role: m.role, content: m.content, model: m.model, seq: m.seq, createdAt: m.created_at })),
  };
}

export async function appendOrbitMessage(
  walletInput: string,
  conversationId: string,
  input: { role: unknown; content: unknown; model?: unknown },
): Promise<OrbitMessage> {
  const wallet = normalizeWalletInput(walletInput);
  await requireProfileRow(wallet);
  if (input.role !== "user" && input.role !== "assistant") throw new Error("INVALID_ORBIT_ROLE");
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 20000) {
    throw new Error("INVALID_ORBIT_MESSAGE");
  }
  const model = typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 200) : null;
  const sb = serviceClient();
  const owner = mustData(
    (await sb.from("orbit_conversations").select("id,title").eq("id", conversationId).eq("profile_wallet", wallet).maybeSingle()) as {
      data: { id: string; title: string | null } | null;
      error: unknown;
    },
    "ORBIT_CONVERSATION",
  );
  if (!owner) throw new Error("ORBIT_CONVERSATION_NOT_FOUND");
  const last = mustData(
    (await sb
      .from("orbit_messages")
      .select("seq")
      .eq("conversation_id", conversationId)
      .order("seq", { ascending: false })
      .limit(1)) as { data: { seq: number }[] | null; error: unknown },
    "ORBIT_MESSAGES",
  );
  const seq = (last[0]?.seq ?? 0) + 1;
  const inserted = mustData(
    (await sb
      .from("orbit_messages")
      .insert({ conversation_id: conversationId, role: input.role, content: input.content, model, seq })
      .select("role,content,model,seq,created_at")
      .single()) as { data: MessageRow | null; error: unknown },
    "ORBIT_MESSAGE",
  );
  if (!owner.title && input.role === "user") {
    await sb.from("orbit_conversations").update({ title: input.content.trim().slice(0, 80) }).eq("id", conversationId);
  }
  return { role: inserted.role, content: inserted.content, model: inserted.model, seq: inserted.seq, createdAt: inserted.created_at };
}

// -- creator coins ------------------------------------------------------------
// One coin per profile (created by the profiles_creator_coin trigger). Market
// stats are derived here rather than denormalized: holders come from
// coin_holdings, volume/change/sparkline from coin_trades. A coin only becomes
// an actual NFT once mint_status is 'minted' and a token_address exists.

const COIN_COLUMNS =
  "id,owner_wallet,name,symbol,price_mst,reserve_mst,total_supply,chain_id,token_address,token_id,mint_status,mint_tx_hash,mint_error,created_at";

/** Initial float, mirrors the total_supply default in 0005_creator_coin_100_mst.sql. */
const COIN_INITIAL_SUPPLY = 10_000;
const COIN_TRADE_LIMIT = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CoinRow = {
  id: string;
  owner_wallet: string;
  name: string;
  symbol: string;
  price_mst: number | string;
  reserve_mst: number | string;
  total_supply: number | string;
  chain_id: string | null;
  token_address: string | null;
  token_id: string | null;
  mint_status: string;
  mint_tx_hash: string | null;
  mint_error: string | null;
  created_at: string;
};

type CoinTradeRow = {
  id: string;
  coin_id: string;
  side: "buy" | "sell";
  trader_wallet: string;
  amount: number | string;
  price_mst: number | string;
  total_mst: number | string;
  settlement: "offchain" | "onchain";
  created_at: string;
};

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asMintStatus(value: unknown): MintStatus {
  return value === "minted" || value === "minting" || value === "failed" ? value : "pending";
}

function coinErrorCode(error: unknown): string {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  const known = [
    "INVALID_COIN_SIDE",
    "INVALID_COIN_AMOUNT",
    "COIN_AMOUNT_TOO_LARGE",
    "COIN_AMOUNT_TOO_SMALL",
    "COIN_NOT_FOUND",
    "COIN_SUPPLY_EXHAUSTED",
    "INSUFFICIENT_COIN_BALANCE",
    "POOL_EMPTY",
    "PROFILE_REQUIRED",
  ];
  return known.find((code) => message.includes(code)) ?? "TRADE_FAILED";
}

/** Build a left-to-right price series from launch → each trade → spot now. */
function buildSpark(trades: CoinTradeRow[], currentPrice: number): number[] {
  const tradePrices = trades
    .map((t) => num(t.price_mst))
    .filter((p) => p > 0)
    .reverse();

  const points: number[] = [COIN_INITIAL_PRICE];
  for (const p of tradePrices) {
    if (Math.abs(points[points.length - 1] - p) > 1e-12) points.push(p);
  }
  if (currentPrice > 0 && Math.abs(points[points.length - 1] - currentPrice) > 1e-12) {
    points.push(currentPrice);
  }
  if (points.length === 1) points.push(points[0]);

  return points.slice(-24).map((p) => +p.toFixed(6));
}

function changeSince(trades: CoinTradeRow[], price: number, sinceIso: string): number {
  const window = trades.filter((t) => t.created_at >= sinceIso);
  if (window.length === 0) return 0;
  const base = num(window[window.length - 1].price_mst);
  if (base <= 0) return 0;
  return +(((price - base) / base) * 100).toFixed(2);
}

async function assembleCoins(rows: CoinRow[], viewer: string | null, tradeLimit = COIN_TRADE_LIMIT): Promise<LiveCoin[]> {
  if (rows.length === 0) return [];
  const sb = serviceClient();
  const ids = rows.map((r) => r.id);
  const wallets = Array.from(new Set(rows.map((r) => r.owner_wallet)));

  const owners = mustData(
    (await sb
      .from("profiles")
      .select("wallet_address,username,display_name,avatar_url,verified")
      .in("wallet_address", wallets)) as {
      data: Pick<ProfileRow, "wallet_address" | "username" | "display_name" | "avatar_url" | "verified">[] | null;
      error: unknown;
    },
    "COIN_OWNERS",
  );
  const ownerByWallet = new Map(owners.map((o) => [o.wallet_address, o]));

  const holdings = mustData(
    (await sb.from("coin_holdings").select("coin_id,wallet,amount").in("coin_id", ids).gt("amount", 0)) as {
      data: { coin_id: string; wallet: string; amount: number | string }[] | null;
      error: unknown;
    },
    "COIN_HOLDINGS",
  );
  const holdersByCoin = new Map<string, number>();
  const holdingByCoinWallet = new Map<string, number>();
  for (const holding of holdings) {
    holdersByCoin.set(holding.coin_id, (holdersByCoin.get(holding.coin_id) ?? 0) + 1);
    // Lowercased both sides: wallet_address is citext, so 0xAbC and 0xabc are
    // one profile, and a Map keyed on the raw string would miss the balance.
    holdingByCoinWallet.set(`${holding.coin_id}:${holding.wallet.toLowerCase()}`, num(holding.amount));
  }

  const trades = mustData(
    (await sb
      .from("coin_trades")
      .select("id,coin_id,side,trader_wallet,amount,price_mst,total_mst,settlement,created_at")
      .in("coin_id", ids)
      .order("created_at", { ascending: false })
      .limit(tradeLimit)) as { data: CoinTradeRow[] | null; error: unknown },
    "COIN_TRADES",
  );
  const tradesByCoin = new Map<string, CoinTradeRow[]>();
  for (const trade of trades) {
    const list = tradesByCoin.get(trade.coin_id);
    if (list) list.push(trade);
    else tradesByCoin.set(trade.coin_id, [trade]);
  }

  const me = viewer ? normalizeWalletInput(viewer).toLowerCase() : null;
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const volumeByCoin = new Map<string, number>();
  for (const trade of trades) {
    if (trade.created_at < dayAgo) continue;
    volumeByCoin.set(trade.coin_id, (volumeByCoin.get(trade.coin_id) ?? 0) + num(trade.total_mst));
  }

  const coins: LiveCoin[] = [];
  for (const row of rows) {
    const owner = ownerByWallet.get(row.owner_wallet);
    if (!owner) continue;
    const price = num(row.price_mst);
    const coinTrades = tradesByCoin.get(row.id) ?? [];
    coins.push({
      id: row.id,
      name: row.name,
      symbol: row.symbol,
      ownerWallet: row.owner_wallet,
      creatorUsername: owner.username,
      creatorDisplayName: owner.display_name,
      creatorAvatarUrl: owner.avatar_url,
      creatorVerified: owner.verified,
      price,
      change24h: changeSince(coinTrades, price, dayAgo),
      volume24h: volumeByCoin.get(row.id) ?? 0,
      marketCap: +(price * COIN_INITIAL_SUPPLY).toFixed(2),
      liquidity: +num(row.reserve_mst).toFixed(2),
      holders: holdersByCoin.get(row.id) ?? 0,
      spark: buildSpark(coinTrades, price),
      reserveMst: num(row.reserve_mst),
      poolSupply: num(row.total_supply),
      totalSupply: COIN_INITIAL_SUPPLY,
      mintStatus: asMintStatus(row.mint_status),
      mintTxHash: row.mint_tx_hash,
      mintError: row.mint_error,
      chainId: row.chain_id,
      tokenAddress: row.token_address,
      tokenId: row.token_id,
      settlement: row.token_address ? "onchain" : "offchain",
      viewerHolding: me ? holdingByCoinWallet.get(`${row.id}:${me}`) ?? 0 : 0,
      createdAt: row.created_at,
    });
  }
  return coins;
}

export async function listLiveCoins(viewer: string | null): Promise<LiveResult<LiveCoin[]>> {
  try {
    const sb = serviceClient();
    const rows = mustData(
      (await sb
        .from("creator_coins")
        .select(COIN_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200)) as { data: CoinRow[] | null; error: unknown },
      "COINS",
    );
    return { data: await assembleCoins(rows, viewer), liveError: null };
  } catch (e) {
    if (e instanceof Error && (e.message === "DB_NOT_READY" || e.message.startsWith("DB_NOT_CONFIGURED"))) {
      return { data: [], liveError: e.message };
    }
    throw e;
  }
}

export async function getLiveCoin(coinId: string, viewer: string | null): Promise<LiveCoin | null> {
  if (!UUID_RE.test(coinId)) return null;
  const sb = serviceClient();
  const result = await sb.from("creator_coins").select(COIN_COLUMNS).eq("id", coinId).maybeSingle();
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    throw new Error("COIN_FAILED");
  }
  const row = result.data as CoinRow | null;
  if (!row) return null;
  const [coin] = await assembleCoins([row], viewer);
  return coin ?? null;
}

export async function listLiveCoinTrades(coinId: string, limit = 30): Promise<LiveCoinTrade[]> {
  if (!UUID_RE.test(coinId)) return [];
  const sb = serviceClient();
  const rows = mustData(
    (await sb
      .from("coin_trades")
      .select("id,coin_id,side,trader_wallet,amount,price_mst,total_mst,settlement,created_at")
      .eq("coin_id", coinId)
      .order("created_at", { ascending: false })
      .limit(limit)) as { data: CoinTradeRow[] | null; error: unknown },
    "COIN_TRADES",
  );
  if (rows.length === 0) return [];
  const wallets = Array.from(new Set(rows.map((r) => r.trader_wallet)));
  const traders = mustData(
    (await sb.from("profiles").select("wallet_address,username").in("wallet_address", wallets)) as {
      data: { wallet_address: string; username: string }[] | null;
      error: unknown;
    },
    "COIN_TRADERS",
  );
  const byWallet = new Map(traders.map((t) => [t.wallet_address, t.username]));
  return rows.map((r) => ({
    id: r.id,
    side: r.side,
    amount: num(r.amount),
    price: num(r.price_mst),
    totalMst: num(r.total_mst),
    settlement: r.settlement,
    createdAt: r.created_at,
    traderUsername: byWallet.get(r.trader_wallet) ?? "unknown",
  }));
}

/** Idempotent: the trigger already created it, so this only reads. */
export async function getMyLiveCoin(walletInput: string): Promise<LiveCoin | null> {
  const wallet = normalizeWalletInput(walletInput);
  const sb = serviceClient();
  const ensured = await sb.rpc("ensure_creator_coin", { p_wallet: wallet });
  if (ensured.error) {
    if (isMissingTable(ensured.error)) throw new Error("DB_NOT_READY");
    throw new Error("ENSURE_COIN_FAILED");
  }
  const coinId = typeof ensured.data === "string" ? ensured.data : null;
  if (!coinId) throw new Error("ENSURE_COIN_FAILED");
  return getLiveCoin(coinId, wallet);
}

export async function tradeLiveCoin(
  walletInput: string,
  coinId: string,
  side: "buy" | "sell",
  amountInput: unknown,
): Promise<LiveCoinTradeResult> {
  const wallet = normalizeWalletInput(walletInput);
  if (!UUID_RE.test(coinId)) throw new Error("COIN_NOT_FOUND");
  const amount = typeof amountInput === "number" ? amountInput : Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_COIN_AMOUNT");
  if (amount > 1_000_000) throw new Error("COIN_AMOUNT_TOO_LARGE");
  const sb = serviceClient();
  const result = await sb.rpc("trade_creator_coin", {
    p_trader: wallet,
    p_coin: coinId,
    p_side: side,
    p_amount: amount,
  });
  if (result.error) throw new Error(coinErrorCode(result.error));
  const data = result.data as {
    side?: string;
    amount?: unknown;
    totalMst?: unknown;
    price?: unknown;
    holding?: unknown;
  } | null;
  if (!data) throw new Error("TRADE_FAILED");
  return {
    side: data.side === "sell" ? "sell" : "buy",
    amount: num(data.amount),
    totalMst: num(data.totalMst),
    price: num(data.price),
    holding: num(data.holding),
  };
}

/** Owner-only. Called after the owner's wallet confirms the on-chain mint. */
export async function recordCoinMint(
  walletInput: string,
  coinId: string,
  input: { status: "minting" | "minted" | "failed"; txHash?: string; tokenAddress?: string; tokenId?: string; error?: string },
): Promise<LiveCoin | null> {
  const wallet = normalizeWalletInput(walletInput);
  if (!UUID_RE.test(coinId)) throw new Error("COIN_NOT_FOUND");
  const sb = serviceClient();
  const owned = await sb.from("creator_coins").select("id").eq("id", coinId).eq("owner_wallet", wallet).maybeSingle();
  if (owned.error) {
    if (isMissingTable(owned.error)) throw new Error("DB_NOT_READY");
    throw new Error("COIN_FAILED");
  }
  if (!owned.data) throw new Error("FORBIDDEN");
  const update: Record<string, string | null> = { mint_status: input.status };
  if (input.status === "minted") {
    if (!input.txHash || !input.tokenAddress) throw new Error("MINT_REFERENCE_REQUIRED");
    const { ACTIVE_NETWORK } = await import("@/lib/mst/config");
    update.mint_tx_hash = input.txHash;
    update.token_address = input.tokenAddress;
    update.token_id = input.tokenId ?? null;
    update.chain_id = String(ACTIVE_NETWORK.chainId);
    update.mint_error = null;
  }
  if (input.status === "failed") update.mint_error = input.error ?? "MINT_FAILED";
  const saved = await sb.from("creator_coins").update(update).eq("id", coinId);
  if (saved.error) throw new Error("MINT_STATUS_FAILED");
  return getLiveCoin(coinId, wallet);
}

// -- post coins ---------------------------------------------------------------
const POST_COIN_COLUMNS =
  "id,post_id,owner_wallet,name,symbol,price_mst,reserve_mst,total_supply,chain_id,token_address,token_id,mint_status,mint_tx_hash,mint_error,created_at";

type PostCoinRow = {
  id: string;
  post_id: string;
  owner_wallet: string;
  name: string;
  symbol: string;
  price_mst: number | string;
  reserve_mst: number | string;
  total_supply: number | string;
  chain_id: string | null;
  token_address: string | null;
  token_id: string | null;
  mint_status: string;
  mint_tx_hash: string | null;
  mint_error: string | null;
  created_at: string;
};

type PostCoinTradeRow = {
  coin_id: string;
  price_mst: number | string;
  total_mst: number | string;
  created_at: string;
};

function toPostCoinInfo(coin: LivePostCoin): PostCoinInfo {
  return {
    id: coin.id,
    postId: coin.postId,
    symbol: coin.symbol,
    name: coin.name,
    price: coin.price,
    change24h: coin.change24h,
    mintStatus: coin.mintStatus,
    tokenAddress: coin.tokenAddress,
    nftTokenId: coin.nftTokenId,
    ownerWallet: coin.ownerWallet,
    viewerHolding: coin.viewerHolding,
    reserveMst: coin.reserveMst,
    poolSupply: coin.totalSupply,
  };
}

async function assemblePostCoins(rows: PostCoinRow[], viewer: string | null): Promise<LivePostCoin[]> {
  if (rows.length === 0) return [];
  const sb = serviceClient();
  const ids = rows.map((r) => r.id);
  const holdings = mustData(
    (await sb.from("post_coin_holdings").select("coin_id,wallet,amount").in("coin_id", ids).gt("amount", 0)) as {
      data: { coin_id: string; wallet: string; amount: number | string }[] | null;
      error: unknown;
    },
    "POST_COIN_HOLDINGS",
  );
  const holdersByCoin = new Map<string, number>();
  const holdingByCoinWallet = new Map<string, number>();
  for (const holding of holdings) {
    holdersByCoin.set(holding.coin_id, (holdersByCoin.get(holding.coin_id) ?? 0) + 1);
    holdingByCoinWallet.set(`${holding.coin_id}:${holding.wallet.toLowerCase()}`, num(holding.amount));
  }
  const trades = mustData(
    (await sb
      .from("post_coin_trades")
      .select("coin_id,price_mst,total_mst,created_at")
      .in("coin_id", ids)
      .order("created_at", { ascending: false })
      .limit(500)) as { data: PostCoinTradeRow[] | null; error: unknown },
    "POST_COIN_TRADES",
  );
  const tradesByCoin = new Map<string, PostCoinTradeRow[]>();
  for (const trade of trades) {
    const list = tradesByCoin.get(trade.coin_id);
    if (list) list.push(trade);
    else tradesByCoin.set(trade.coin_id, [trade]);
  }
  const me = viewer ? normalizeWalletInput(viewer).toLowerCase() : null;
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const volumeByCoin = new Map<string, number>();
  for (const trade of trades) {
    if (trade.created_at < dayAgo) continue;
    volumeByCoin.set(trade.coin_id, (volumeByCoin.get(trade.coin_id) ?? 0) + num(trade.total_mst));
  }
  const coins: LivePostCoin[] = [];
  for (const row of rows) {
    const price = num(row.price_mst);
    const coinTrades = (tradesByCoin.get(row.id) ?? []).map((t) => ({
      id: "",
      coin_id: t.coin_id,
      side: "buy" as const,
      trader_wallet: "",
      amount: 0,
      price_mst: t.price_mst,
      total_mst: t.total_mst,
      settlement: "offchain" as const,
      created_at: t.created_at,
    }));
    coins.push({
      id: row.id,
      postId: row.post_id,
      name: row.name,
      symbol: row.symbol,
      ownerWallet: row.owner_wallet,
      price,
      change24h: changeSince(coinTrades, price, dayAgo),
      volume24h: volumeByCoin.get(row.id) ?? 0,
      holders: holdersByCoin.get(row.id) ?? 0,
      reserveMst: num(row.reserve_mst),
      totalSupply: num(row.total_supply),
      mintStatus: asMintStatus(row.mint_status),
      mintTxHash: row.mint_tx_hash,
      mintError: row.mint_error,
      chainId: row.chain_id,
      tokenAddress: row.token_address,
      nftTokenId: row.token_id,
      settlement: row.token_address ? "onchain" : "offchain",
      viewerHolding: me ? holdingByCoinWallet.get(`${row.id}:${me}`) ?? 0 : 0,
      createdAt: row.created_at,
    });
  }
  return coins;
}

async function loadPostCoinInfoByPostIds(postIds: string[], viewer: string | null): Promise<Map<string, PostCoinInfo>> {
  if (postIds.length === 0) return new Map();
  try {
    const sb = serviceClient();
    const rows = mustData(
      (await sb.from("post_coins").select(POST_COIN_COLUMNS).in("post_id", postIds)) as {
        data: PostCoinRow[] | null;
        error: unknown;
      },
      "POST_COINS",
    );
    const coins = await assemblePostCoins(rows, viewer);
    return new Map(coins.map((c) => [c.postId, toPostCoinInfo(c)]));
  } catch (e) {
    if (e instanceof Error && (e.message === "DB_NOT_READY" || e.message.startsWith("DB_NOT_CONFIGURED"))) {
      return new Map();
    }
    throw e;
  }
}

export async function getPostCoinByPostId(postId: string, viewer: string | null): Promise<LivePostCoin | null> {
  const sb = serviceClient();
  const result = await sb.from("post_coins").select(POST_COIN_COLUMNS).eq("post_id", postId).maybeSingle();
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_COIN_FAILED");
  }
  const row = result.data as PostCoinRow | null;
  if (!row) return null;
  const [coin] = await assemblePostCoins([row], viewer);
  return coin ?? null;
}

export async function getPostCoinById(coinId: string, viewer: string | null): Promise<LivePostCoin | null> {
  if (!UUID_RE.test(coinId)) return null;
  const sb = serviceClient();
  const result = await sb.from("post_coins").select(POST_COIN_COLUMNS).eq("id", coinId).maybeSingle();
  if (result.error) {
    if (isMissingTable(result.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_COIN_FAILED");
  }
  const row = result.data as PostCoinRow | null;
  if (!row) return null;
  const [coin] = await assemblePostCoins([row], viewer);
  return coin ?? null;
}

/** Sync post coin reserve / pool / price from the on-chain CreatorCoin pool. */
export async function syncPostCoinPoolFromChain(coinId: string): Promise<void> {
  if (!UUID_RE.test(coinId)) return;
  const sb = serviceClient();
  const row = await sb.from("post_coins").select("token_address").eq("id", coinId).maybeSingle();
  if (row.error || !row.data) return;
  const token = (row.data as { token_address: string | null }).token_address;
  if (!token) return;
  const { getCoinPoolOnChain } = await import("@/lib/mst/contracts");
  const pool = await getCoinPoolOnChain(token);
  await sb.from("post_coins").update({
    reserve_mst: pool.reserveMst,
    total_supply: pool.poolSupply,
    price_mst: pool.price,
  }).eq("id", coinId);
}

export async function tradeLivePostCoin(
  walletInput: string,
  coinId: string,
  side: "buy" | "sell",
  amountInput: unknown,
): Promise<LivePostCoinTradeResult> {
  const wallet = normalizeWalletInput(walletInput);
  if (!UUID_RE.test(coinId)) throw new Error("COIN_NOT_FOUND");
  const amount = typeof amountInput === "number" ? amountInput : Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_COIN_AMOUNT");
  if (amount > 1_000_000) throw new Error("COIN_AMOUNT_TOO_LARGE");
  const sb = serviceClient();
  const result = await sb.rpc("trade_post_coin", {
    p_trader: wallet,
    p_coin: coinId,
    p_side: side,
    p_amount: amount,
  });
  if (result.error) throw new Error(coinErrorCode(result.error));
  const data = result.data as {
    side?: string;
    amount?: unknown;
    totalMst?: unknown;
    price?: unknown;
    holding?: unknown;
  } | null;
  if (!data) throw new Error("TRADE_FAILED");
  return {
    side: data.side === "sell" ? "sell" : "buy",
    amount: num(data.amount),
    totalMst: num(data.totalMst),
    price: num(data.price),
    holding: num(data.holding),
  };
}

export async function recordPostCoinMint(
  walletInput: string,
  coinId: string,
  input: { status: "minting" | "minted" | "failed"; txHash?: string; tokenAddress?: string; tokenId?: string; error?: string },
): Promise<LivePostCoin | null> {
  const wallet = normalizeWalletInput(walletInput);
  if (!UUID_RE.test(coinId)) throw new Error("COIN_NOT_FOUND");
  const sb = serviceClient();
  const owned = await sb.from("post_coins").select("id,post_id").eq("id", coinId).eq("owner_wallet", wallet).maybeSingle();
  if (owned.error) {
    if (isMissingTable(owned.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_COIN_FAILED");
  }
  if (!owned.data) throw new Error("FORBIDDEN");
  const update: Record<string, string | null> = { mint_status: input.status };
  if (input.status === "minted") {
    if (!input.txHash || !input.tokenAddress) throw new Error("MINT_REFERENCE_REQUIRED");
    const { ACTIVE_NETWORK } = await import("@/lib/mst/config");
    update.mint_tx_hash = input.txHash;
    update.token_address = input.tokenAddress;
    update.token_id = input.tokenId ?? null;
    update.chain_id = String(ACTIVE_NETWORK.chainId);
    update.mint_error = null;
  }
  if (input.status === "failed") update.mint_error = input.error ?? "MINT_FAILED";
  const saved = await sb.from("post_coins").update(update).eq("id", coinId);
  if (saved.error) throw new Error("MINT_STATUS_FAILED");
  return getPostCoinById(coinId, wallet);
}

/** Attach an ERC-721 token id to a post that already has an on-chain ERC-20 coin. */
export async function recordPostNftMint(
  walletInput: string,
  coinId: string,
  input: { txHash: string; tokenId: string },
): Promise<LivePostCoin | null> {
  const wallet = normalizeWalletInput(walletInput);
  if (!UUID_RE.test(coinId)) throw new Error("COIN_NOT_FOUND");
  const sb = serviceClient();
  const owned = await sb
    .from("post_coins")
    .select("id,mint_status,token_address")
    .eq("id", coinId)
    .eq("owner_wallet", wallet)
    .maybeSingle();
  if (owned.error) {
    if (isMissingTable(owned.error)) throw new Error("DB_NOT_READY");
    throw new Error("POST_COIN_FAILED");
  }
  const row = owned.data as { id: string; mint_status: string; token_address: string | null } | null;
  if (!row) throw new Error("FORBIDDEN");
  if (row.mint_status !== "minted" || !row.token_address) throw new Error("TOKEN_NOT_MINTED");
  const saved = await sb
    .from("post_coins")
    .update({ token_id: input.tokenId, mint_tx_hash: input.txHash, mint_error: null })
    .eq("id", coinId);
  if (saved.error) throw new Error("NFT_MINT_STATUS_FAILED");
  return getPostCoinById(coinId, wallet);
}
