// Bikram Sambat helpers: AD → BS conversion (so dates can be typed in either calendar) and display in Nepali.
// Everything is stored and shown in BS; AD is only an input convenience.
import { adToBs, bsToAd } from "@sbmdkl/nepali-date-converter";
import { MONTHS_NE, na, np } from "./text";

/** Range the conversion tables cover. */
export const AD_MIN_YEAR = 1943;
export const AD_MAX_YEAR = 2043;

const z = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" (AD) → "YYYY-MM-DD" (BS), or null when the date is invalid / outside the supported years. */
export function adToBsStr(ad: string): string | null {
  const [y, m, d] = na(ad).split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d || y < AD_MIN_YEAR || y > AD_MAX_YEAR) return null;
  try {
    return adToBs(`${y}-${z(m)}-${z(d)}`);
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" (BS) → "YYYY-MM-DD" (AD), or null. */
export function bsToAdStr(bs: string): string | null {
  const [y, m, d] = na(bs).split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  try {
    return bsToAd(`${y}-${z(m)}-${z(d)}`);
  } catch {
    return null;
  }
}

/** Today's exact BS date [year, month, day] (falls back to null outside the table). */
export function todayBs(now: Date = new Date()): [number, number, number] | null {
  const s = adToBsStr(`${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`);
  return s ? (s.split("-").map(Number) as [number, number, number]) : null;
}

/** Stored BS value → Nepali words and digits: "२०४४ बैशाख २२", "२०४४ बैशाख" or "२०४४". Empty → "". */
export function neDate(s?: string | null): string {
  if (!s) return "";
  const [y, m, d] = na(s).split("-").map((x) => parseInt(x, 10) || 0);
  if (!y) return np(s);
  return [np(y), m >= 1 && m <= 12 ? MONTHS_NE[m - 1] : "", m && d ? np(d) : ""].filter(Boolean).join(" ");
}

export const WEEKDAYS_NE = ["आइतबार", "सोमबार", "मङ्गलबार", "बुधबार", "बिहीबार", "शुक्रबार", "शनिबार"];

/** Days until the next occurrence of a BS month/day birthday-style date from `today`, or null when unknown. */
export function daysUntilBs(stored: string | null | undefined, now: Date = new Date()): number | null {
  const [, m, d] = na(stored || "").split("-").map((x) => parseInt(x, 10) || 0);
  const t = todayBs(now);
  if (!t || !m || !d) return null;
  for (const yy of [t[0], t[0] + 1]) {
    const ad = bsToAdStr(`${yy}-${z(m)}-${z(d)}`);
    if (!ad) continue;
    const [ay, am, ad2] = ad.split("-").map(Number);
    const diff = Math.round((new Date(ay, am - 1, ad2).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
    if (diff >= 0) return diff;
  }
  return null;
}
