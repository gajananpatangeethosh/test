// Server-only Supabase environment access.
// Only import this module from server code (DAL, Server Actions, Route Handlers).
// Client components must never import it; NEXT_PUBLIC_ URLs are the only values
// that may cross into the browser.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!url) throw new Error("DB_NOT_CONFIGURED: missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

export function supabaseSecretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("DB_NOT_CONFIGURED: missing SUPABASE_SECRET_KEY");
  return key;
}

export function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret) throw new Error("AUTH_NOT_CONFIGURED: missing SESSION_SECRET");
  return new TextEncoder().encode(secret);
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
