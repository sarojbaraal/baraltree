// Site-wide default avatars. Admin may upload male.* / female.* to the public `site-assets` bucket; until then (or
// if the bucket is missing) the built-in SVGs are used. The last known URLs are cached so the first paint is right.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SiteAvatars {
  M?: string;
  F?: string;
}

const KEY = "vv_avatars";
let cur: SiteAvatars = {};
const subs = new Set<() => void>();

export const getSiteAvatars = (): SiteAvatars => cur;
export const subscribeSiteAvatars = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
const set = (a: SiteAvatars) => {
  if (a.M === cur.M && a.F === cur.F) return;
  cur = a;
  subs.forEach((f) => f());
};

/** Show the cached URLs immediately (call on the client only). */
export function primeSiteAvatars() {
  try {
    set(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {}
}

/** The file names we accept, in the order they are looked up. */
export const AVATAR_FILES = { M: "male", F: "female" } as const;

/** Reads the bucket and updates the store. Missing bucket or files → built-in avatars. */
export async function loadSiteAvatars(db: SupabaseClient) {
  try {
    const { data, error } = await db.storage.from("site-assets").list("", { limit: 50 });
    if (error || !data) return;
    const next: SiteAvatars = {};
    (["M", "F"] as const).forEach((g) => {
      const f = data.find((o) => o.name.split(".")[0] === AVATAR_FILES[g]);
      if (f) next[g] = db.storage.from("site-assets").getPublicUrl(f.name).data.publicUrl + "?v=" + encodeURIComponent(f.updated_at || f.created_at || "");
    });
    set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  } catch {}
}
