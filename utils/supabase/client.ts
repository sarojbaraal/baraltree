// utils/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://onhznyefbseptuwurqxx.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uaHpueWVmYnNlcHR1d3VycXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NTM5NDUsImV4cCI6MjEwNjMyOTk0NX0.4o8tWadbJZ29uXaW7Gbn_2IinDLVtsda757kz-be1z0";

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
