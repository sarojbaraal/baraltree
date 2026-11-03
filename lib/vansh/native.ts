// Android app (Capacitor) helpers. On the website everything here falls back to the normal browser behaviour.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Custom link scheme the Android app listens to (also set in AndroidManifest.xml and the Supabase redirect list). */
export const APP_SCHEME = "com.myapp.app";
export const APP_REDIRECT = `${APP_SCHEME}://auth`;
/** Public address of the website; invitation links must point here, not at the app's internal address. */
const WEB = process.env.NEXT_PUBLIC_SITE_URL || "https://baraltree.vercel.app/";

export const isNative = () => typeof window !== "undefined" && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** Address of the web version of the app (used for sharing invitation links). */
export const webUrl = () => (isNative() ? WEB : `${location.origin}${location.pathname}`);

/** Where sign-in / password-reset emails send the user back to. */
export const authRedirect = () => (isNative() ? APP_REDIRECT : `${location.origin}${location.pathname}`);

/** Google / Facebook sign-in. In the app it opens the system browser and returns through the custom link. */
export async function oauthSignIn(db: SupabaseClient, provider: "google" | "facebook"): Promise<string | null> {
  if (!isNative()) {
    const { error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirect() } });
    return error ? error.message : null;
  }
  const { data, error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: APP_REDIRECT, skipBrowserRedirect: true } });
  if (error || !data.url) return error?.message || "लगइन सुरु गर्न सकिएन";
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
  return null;
}

/** Handles the link the browser opens after sign-in / password reset (com.myapp.app://auth?code=…). */
export async function initDeepLinks(db: SupabaseClient, onDone: () => void): Promise<() => void> {
  if (!isNative()) return () => {};
  const { App } = await import("@capacitor/app");
  const handle = async (url: string) => {
    if (!url.startsWith(APP_SCHEME + "://")) return;
    const u = new URL(url.replace(APP_SCHEME + "://", "https://app.local/"));
    const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
    const code = u.searchParams.get("code");
    try {
      if (code) await db.auth.exchangeCodeForSession(code);
      else if (hash.get("access_token") && hash.get("refresh_token"))
        await db.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
      if (hash.get("type") === "recovery" || u.searchParams.get("type") === "recovery") window.dispatchEvent(new Event("vv-recovery"));
    } finally {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch {
        /* the browser sheet was already closed */
      }
      onDone();
    }
  };
  const sub = await App.addListener("appUrlOpen", (e) => handle(e.url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) handle(launch.url);
  return () => void sub.remove();
}
