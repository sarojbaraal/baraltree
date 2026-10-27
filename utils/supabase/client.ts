// utils/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bbrdnjkbmjwdgwahkbro.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJicmRuamtibWp3ZGd3YWhrYnJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMDgzNDUsImV4cCI6MjEwNzg4NDM0NX0.flZ3i0T8Mw042r5zVRV2NpilqPVchlKj0YjFLYt0mno";

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
