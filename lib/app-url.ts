/** Public base URL for ERC-721 metadata and external links. */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  // Browser: use the live site origin (works on Vercel without extra env).
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // Server (API routes): Vercel injects VERCEL_URL automatically.
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  if (vercel) return vercel;
  return "http://localhost:3000";
}

export function postNftMetadataUrl(postId: string): string {
  return `${appUrl()}/api/nft/${encodeURIComponent(postId)}`;
}
