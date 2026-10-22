// Text, search and Bikram Sambat date helpers (ported from the original app.js).

const DEVA = "०१२३४५६७८९";

/** ASCII digits → Devanagari digits. */
export const np = (n: unknown): string => String(n).replace(/\d/g, (d) => DEVA[+d]);
/** Devanagari digits → ASCII digits. */
export const na = (s: unknown): string => String(s ?? "").replace(/[०-९]/g, (d) => String(DEVA.indexOf(d)));

export const yr = (s?: string | null): string => (s || "").slice(0, 4);

export const LABEL: Record<string, string> = {
  name: "नाम ",
  gender: "लिङ्ग ",
  father_id: "बुबा ",
  mother_id: "आमा ",
  spouse_id: "पति/पत्नी ",
  father_name: "बुबा (नयाँ नाम) ",
  mother_name: "आमा (नयाँ नाम) ",
  spouse_name: "पति/पत्नी (नयाँ नाम) ",
  is_living: "जीवित ",
  birth_bs: "जन्म मिति (BS) ",
  death_bs: "मृत्यु मिति (BS) ",
  phone: "फोन ",
  address: "ठेगाना ",
  notes: "टिप्पणी ",
  maiden_name: "विवाहअघिको थर (Maiden) ",
  married_name: "विवाहपछिको थर (Married) ",
  birth_place: "जन्म स्थान ",
  death_place: "मृत्यु स्थान ",
  education: "शिक्षा ",
  occupation: "पेशा ",
  marriage_bs: "विवाह मिति (BS) ",
  photo_url: "प्रोफाइल फोटो ",
};
export const XL: Record<string, string> = {
  facebook: "Facebook लिंक",
  add_spouse_id: "अर्को पति/पत्नी",
  add_spouse_name: "अर्को पति/पत्नी (नयाँ नाम)",
};
/** Editable person fields sent in change requests. */
export const FIELDS = Object.keys(LABEL).filter((k) => k !== "photo_url");

// Devanagari → rough Latin skeleton so that "ram" matches "राम".
const DM: Record<string, string> = {
  "क": "k",
  "ख": "k",
  "ग": "g",
  "घ": "g",
  "ङ": "n",
  "च": "c",
  "छ": "c",
  "ज": "j",
  "झ": "j",
  "ञ": "n",
  "ट": "t",
  "ठ": "t",
  "ड": "d",
  "ढ": "d",
  "ण": "n",
  "त": "t",
  "थ": "t",
  "द": "d",
  "ध": "d",
  "न": "n",
  "प": "p",
  "फ": "p",
  "ब": "b",
  "भ": "b",
  "म": "m",
  "य": "y",
  "र": "r",
  "ल": "l",
  "व": "b",
  "श": "s",
  "ष": "s",
  "स": "s",
  "ह": "h",
  "ऋ": "r",
  "ृ": "r",
  "ळ": "l",
};

export function skel(input: string): string {
  const s = String(input || "").toLowerCase().replace(/ज्ञ/g, "gy");
  let o = "";
  for (const ch of s) o += DM[ch] ?? (/[a-z]/.test(ch) ? ch : "");
  return o
    .replace(/chh|ch/g, "c")
    .replace(/([kgjtdpb])h/g, "$1")
    .replace(/sh/g, "s")
    .replace(/x/g, "ks")
    .replace(/f/g, "p")
    .replace(/[vw]/g, "b")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/[aeiou]/g, "");
}

/** Substring match; Latin queries also match Devanagari text phonetically. `q` must be lower-case. */
export function match(text: unknown, q: string): boolean {
  const t = String(text || "").toLowerCase();
  if (t.includes(q)) return true;
  if (!/[a-z]/.test(q)) return false;
  const k = skel(q);
  return !!k && skel(t).includes(k);
}

export const surnameOf = (n?: string | null): string => {
  const w = String(n || "").trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? w[w.length - 1] : "";
};

export interface WifeNames {
  name: string;
  maiden_name: string;
  married_name: string;
}

/** Appends the husband's surname to a wife's name, remembering the maiden surname. */
export function wifeNames(
  nameIn?: string | null,
  maiden?: string | null,
  marriedIn?: string | null,
  hs?: string | null
): WifeNames | null {
  const name = String(nameIn || "").trim();
  const married = String(marriedIn || "").trim();
  if (!name || !hs) return null;
  let base = name;
  if (married && base.endsWith(" " + married)) base = base.slice(0, -(married.length + 1)).trim();
  const w = base.split(/\s+/);
  if (w.length > 1 && w[w.length - 1] === hs) {
    return { name: base, maiden_name: maiden || (w.length > 2 ? w[w.length - 2] : ""), married_name: hs };
  }
  return { name: base + " " + hs, maiden_name: maiden || (w.length > 1 ? w[w.length - 1] : ""), married_name: hs };
}

export const fbOk = (u?: string | null): boolean => /^https:\/\/((www|m|web)\.)?(facebook|fb)\.com\//i.test(u || "");

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Approximate current Bikram Sambat date [year, month, day] (new year ≈ 14 April). */
export function bsNow(now: Date = new Date()): [number, number, number] {
  const y0 = now.getFullYear();
  const s0 = new Date(y0, 3, 14);
  const ok = now >= s0;
  const st = ok ? s0 : new Date(y0 - 1, 3, 14);
  const df = Math.floor((now.getTime() - st.getTime()) / 864e5);
  return [ok ? y0 + 57 : y0 + 56, Math.min(12, Math.floor(df / 30.4) + 1), Math.floor(df % 30.4) + 1];
}

export function bsYear(now: Date = new Date()): number {
  return now.getFullYear() + (now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 14) ? 57 : 56);
}

const parts = (x?: string | null) => String(x || "").split("-").map((v) => parseInt(v) || 0);

/** Age in years between BS dates `b` and `d` (default: today). Null when unknown. */
export function ageN(b?: string | null, d?: string | null, now?: Date): number | null {
  const [y, m, g] = parts(b);
  if (!y) return null;
  const [ey, em, eg] = d ? parts(d) : bsNow(now);
  if (!ey || ey < y) return null;
  let a = ey - y;
  if (m && em && (em < m || (em === m && g && eg && eg < g))) a--;
  return Math.max(0, a);
}

export const MONTHS_NE = ["बैशाख", "जेठ", "असार", "श्रावण", "भदौ", "आश्विन", "कार्तिक", "मंसिर", "पौष", "माघ", "फागुन", "चैत"];

/** Combine year / month / day inputs into "YYYY-MM-DD" (unknown month/day → "00"). */
export function composeDate(y: string, m: string, d: string): string {
  const yy = na(y).replace(/\D/g, "").slice(0, 4);
  const z = (n: string | number) => String(n).padStart(2, "0");
  return yy ? `${yy}-${m ? z(m) : "00"}-${d ? z(d) : "00"}` : "";
}

/** Name for display: demised people get "स्वर्गीय " (or "स्व. " when compact). Stored names are never changed. */
export function dispName(p: { name: string; is_living?: boolean | null }, compact = false): string {
  if (p.is_living !== false || /^(स्वर्गीय|स्व\.)\s/.test(p.name)) return p.name;
  return (compact ? "स्व. " : "स्वर्गीय ") + p.name;
}
