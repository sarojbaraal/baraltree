// Brand, usage notice and per-download "digital signature" stamp used on every exported file.
export const BRAND = "बराल बंशबृक्ष";
export const NOTICE =
  `© ${BRAND} — यो विवरण पारिवारिक तथा व्यक्तिगत प्रयोजनका लागि मात्र हो। अनुमति बिना व्यावसायिक (commercial) प्रयोग, प्रतिलिपि, पुनर्वितरण वा सार्वजनिक प्रकाशन निषेध गरिएको छ।`;

export interface Stamp {
  who: string;
  /** e.g. 2026-10-24 17:30 */
  when: string;
  /** short content hash, quoted in the footer so a copy can be traced back */
  id: string;
  line: string;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Builds the signature line. `seed` should describe the content (title, counts) so the id is content-bound. */
export async function makeStamp(who: string, userKey: string, seed: string): Promise<Stamp> {
  const d = new Date();
  const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  let id = "";
  try {
    id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userKey}|${d.toISOString()}|${seed}`))).slice(0, 12).toUpperCase();
  } catch {
    id = Math.random().toString(16).slice(2, 14).toUpperCase();
  }
  const name = who || "सदस्य";
  return { who: name, when, id, line: `डिजिटल हस्ताक्षर: ${name} द्वारा ${when} मा डाउनलोड · दस्तावेज ID ${id}` };
}

/** Splits text into lines of about `n` characters, breaking at spaces. */
export function wrapChars(text: string, n: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > n && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}
