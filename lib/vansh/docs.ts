// PDF attachments (handwriting, written works) kept in the private `person-docs` bucket.
// The list lives in people.documents; the object path is only revealed through get_people, which is visibility-filtered.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonDoc } from "./types";

export const DOC_BUCKET = "person-docs";
export const DOC_MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
export const DOC_MAX_COUNT = 10; // matches people_documents_chk

export const isPdf = (f: { type: string; name: string }) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Returns an error message, or "" when `files` may be added to a list that already holds `have` documents. */
export function checkNewDocs(have: number, files: { type: string; name: string; size: number }[]): string {
  if (have + files.length > DOC_MAX_COUNT) return `एक व्यक्तिको बढीमा ${DOC_MAX_COUNT} PDF राख्न मिल्छ।`;
  for (const f of files) {
    if (!isPdf(f)) return `"${f.name}" PDF होइन — PDF मात्र राख्न मिल्छ।`;
    if (f.size > DOC_MAX_BYTES) return `"${f.name}" १०MB भन्दा ठूलो छ।`;
    if (f.size === 0) return `"${f.name}" खाली फाइल हो।`;
  }
  return "";
}

const uploadMsg = (m: string) =>
  /row-level|policy/i.test(m) ? "तपाईंलाई कागजात राख्ने अनुमति छैन। एडमिनलाई भन्नुहोस्" : /size|large|payload/i.test(m) ? "फाइल धेरै ठूलो छ" : /network|fetch/i.test(m) ? "इन्टरनेट जडान जाँच्नुहोस्" : m;

/** Uploads one by one; stops at the first failure (files already uploaded stay in the bucket until an admin removes them). */
export async function uploadDocs(db: SupabaseClient, personId: string | null, files: File[]): Promise<{ docs?: PersonDoc[]; error?: string }> {
  const docs: PersonDoc[] = [];
  for (const f of files) {
    const path = `${personId || "new"}/${crypto.randomUUID()}.pdf`;
    const { error } = await db.storage.from(DOC_BUCKET).upload(path, f, { contentType: "application/pdf" });
    if (error) return { error: `"${f.name}" अपलोड असफल: ${uploadMsg(error.message)}` };
    docs.push({ path, name: f.name.slice(0, 120), size: f.size });
  }
  return { docs };
}

/** Opens a short-lived signed link in a new tab. Returns an error message, or "". */
export async function openDoc(db: SupabaseClient, path: string): Promise<string> {
  // open the tab synchronously (inside the click) so the popup blocker allows it, then point it at the signed URL
  const w = window.open("", "_blank");
  const { data, error } = await db.storage.from(DOC_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    w?.close();
    return "कागजात खोल्न सकिएन: " + (error?.message || "लिंक बन्न सकेन");
  }
  if (w) {
    w.opener = null;
    w.location.href = data.signedUrl;
  } else window.location.href = data.signedUrl;
  return "";
}
