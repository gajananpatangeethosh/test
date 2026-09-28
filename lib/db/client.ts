// Server-only Supabase service client.
// Uses the secret key, so it bypasses RLS by design. Never import from client
// components; only the DAL, Server Actions, and Route Handlers may use it.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "./env";

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "echo-web2-server" } },
  });
  return cached;
}

export function isMissingTable(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.code === "PGRST205") return true;
  const message = String(e.message ?? "");
  return message.includes("schema cache") || message.includes("Could not find the table");
}
