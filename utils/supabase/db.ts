import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sync DB client — no cookies(), no Supabase Auth refresh.
 * Auth for this app is the custom SESSION_COOKIE; RLS is disabled on tables.
 */
let cached: SupabaseClient | null = null;

export function createDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc PUBLISHABLE_KEY.");
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
