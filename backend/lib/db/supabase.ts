/**
 * Supabase singleton using the service-role key.
 * The service role key bypasses RLS – never expose it to the frontend.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const env = getEnv();
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _client;
}
