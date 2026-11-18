import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

// Cliente com service role: ignora RLS. Use só depois de checar quem chama.
let admin: SupabaseClient | undefined;
export function adminClient(): SupabaseClient {
  if (!admin) {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export function functionsUrl(name: string): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/${name}`;
}
