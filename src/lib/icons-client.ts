import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getIconsServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.ICONS_SUPABASE_URL;
  const key = process.env.ICONS_SUPABASE_SERVICE_KEY;
  if (!url) throw new Error("Missing ICONS_SUPABASE_URL");
  if (!key) throw new Error("Missing ICONS_SUPABASE_SERVICE_KEY");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function isIconsConfigured(): boolean {
  return !!(process.env.ICONS_SUPABASE_URL && process.env.ICONS_SUPABASE_SERVICE_KEY);
}
