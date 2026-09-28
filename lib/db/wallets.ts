// Server-side wallet/username/phone validation.
// Wallet addresses are the primary key, so these checks run on every write.

export function isSeedWallet(value: string): boolean {
  return value.startsWith("seed:");
}

export function normalizeWalletInput(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_WALLET");
  const v = value.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(v)) return v;
  if (/^seed:[a-z0-9_]{1,30}$/.test(v)) return v.toLowerCase();
  throw new Error("INVALID_WALLET");
}

/** Real login addresses only. Demo seed wallets can never sign in. */
export function requireLoginAddress(value: unknown): string {
  const v = normalizeWalletInput(value);
  if (isSeedWallet(v)) throw new Error("SEED_WALLET_CANNOT_SIGN_IN");
  return v;
}

export function normalizeUsername(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_USERNAME");
  const v = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(v)) throw new Error("INVALID_USERNAME");
  if (v === "seed") throw new Error("USERNAME_RESERVED");
  return v;
}

export function normalizePhone(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("INVALID_PHONE");
  const v = value.trim();
  if (!v) return null;
  if (!/^\+[1-9][0-9]{6,14}$/.test(v)) throw new Error("INVALID_PHONE");
  return v;
}

export function normalizeCaption(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_CAPTION");
  const v = value.trim();
  if (!v) throw new Error("CAPTION_REQUIRED");
  if (v.length > 5000) throw new Error("CAPTION_TOO_LONG");
  return v;
}

export function normalizeCommentBody(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_COMMENT");
  const v = value.trim();
  if (v.length < 1 || v.length > 2000) throw new Error("INVALID_COMMENT");
  return v;
}

export function normalizePostKind(value: unknown): "photo" | "video" | "text" {
  if (value === "photo" || value === "video" || value === "text") return value;
  throw new Error("INVALID_POST_KIND");
}
