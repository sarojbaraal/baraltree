// Upcoming family occasions: birthdays, श्राद्ध (death-anniversary tithi) and wedding anniversaries.
import type { VPerson } from "./types";
import { adToBsStr, bsToAdStr, daysUntilBs, todayBs } from "./bs";
import { na, np } from "./text";
import { Panchang, panchangOn, sameTithi, tithiLabel } from "./tithi";

export type EventKind = "birthday" | "shraddha" | "anniversary";
export interface FamilyEvent {
  kind: EventKind;
  /** The person (for an anniversary: the one holding the marriage date). */
  person: VPerson;
  spouse?: VPerson;
  /** Days from today (0 = today). Negative for a birthday that passed within the last week. */
  days: number;
  /** One short line: "भाद्र कृष्ण अष्टमी", "४५ वर्ष पुग्दै" … */
  detail: string;
  own?: boolean;
}

const parts = (s?: string | null) => na(s || "").split("-").map((x) => parseInt(x, 10) || 0);
const full = (s?: string | null) => {
  const [y, m, d] = parts(s);
  return !!y && !!m && !!d;
};
const addDays = (now: Date, n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);

/** Days from `now` to the next/last occurrence of a BS month/day; also tells which BS year it falls in. */
function nextBs(stored: string, now: Date): { days: number; year: number } | null {
  const d = daysUntilBs(stored, now);
  const t = todayBs(now);
  if (d == null || !t) return null;
  const [, m, dd] = parts(stored);
  const later = m > t[1] || (m === t[1] && dd >= t[2]);
  return { days: d, year: later ? t[0] : t[0] + 1 };
}

/** Birthday that passed within the last `back` days (negative days) or null. */
function recentBs(stored: string, now: Date, back: number): { days: number; year: number } | null {
  const t = todayBs(now);
  if (!t) return null;
  const [, m, dd] = parts(stored);
  if (!m || !dd) return null;
  for (let i = 1; i <= back; i++) {
    const past = addDays(now, -i);
    const pb = todayBs(past);
    if (pb && pb[1] === m && pb[2] === dd) return { days: -i, year: pb[0] };
  }
  return null;
}

export interface EventsOptions {
  now?: Date;
  /** Look this many days ahead (default 7). */
  ahead?: number;
  /** Also list birthdays that passed within this many days (default 7). */
  back?: number;
  can: (id: string) => boolean;
  /** The signed-in person's own record. */
  meId?: string | null;
}

export interface EventsResult {
  /** The signed-in person's own birthday countdown, shown whatever the distance. */
  own: FamilyEvent | null;
  upcoming: FamilyEvent[];
  recent: FamilyEvent[];
}

export function familyEvents(people: VPerson[], o: EventsOptions): EventsResult {
  const now = o.now || new Date();
  const ahead = o.ahead ?? 7;
  const back = o.back ?? 7;
  const byId = new Map(people.map((p) => [p.id, p]));
  const upcoming: FamilyEvent[] = [];
  const recent: FamilyEvent[] = [];
  let own: FamilyEvent | null = null;

  // birthdays
  people.forEach((p) => {
    if (p.is_living === false || p.name_only || !o.can(p.id) || !full(p.birth_bs)) return;
    const nx = nextBs(p.birth_bs!, now);
    if (!nx) return;
    const born = parts(p.birth_bs)[0];
    const age = born ? nx.year - born : 0;
    const detail = age > 0 && age < 130 ? `${np(age)} वर्ष पुग्दै` : "";
    const ev: FamilyEvent = { kind: "birthday", person: p, days: nx.days, detail, own: p.id === o.meId };
    if (ev.own) own = ev;
    if (nx.days <= ahead) upcoming.push(ev);
    else {
      const rc = recentBs(p.birth_bs!, now, back);
      if (rc) recent.push({ ...ev, days: rc.days, detail: born && rc.year - born > 0 ? `${np(rc.year - born)} वर्ष पुगे` : "" });
    }
  });

  // श्राद्ध: the tithi (and lunar month) of the death date comes round again
  const wanted = people.filter((p) => p.is_living === false && !p.name_only && o.can(p.id) && full(p.death_bs));
  if (wanted.length) {
    const days = Array.from({ length: ahead + 1 }, (_, i) => {
      const d = addDays(now, i);
      return { i, pc: panchangOn(d.getFullYear(), d.getMonth() + 1, d.getDate()) };
    });
    const cache = new Map<string, Panchang | null>();
    wanted.forEach((p) => {
      let pc = cache.get(p.death_bs!);
      if (pc === undefined) {
        const ad = bsToAdStr(p.death_bs!);
        pc = ad ? panchangOn(...(ad.split("-").map(Number) as [number, number, number])) : null; // before BS 2000 the tables end
        cache.set(p.death_bs!, pc);
      }
      if (!pc) return;
      const hit = days.find((x) => sameTithi(x.pc, pc!));
      if (hit) upcoming.push({ kind: "shraddha", person: p, days: hit.i, detail: tithiLabel(pc) });
    });
  }

  // wedding anniversaries: both living (or the other not recorded); one entry per couple
  const seen = new Set<string>();
  people.forEach((p) => {
    if (p.is_living === false || p.name_only || !o.can(p.id) || !full(p.marriage_bs)) return;
    const sp = p.spouse_id ? byId.get(p.spouse_id) : undefined;
    if (sp && (sp.is_living === false || !o.can(sp.id))) return;
    const key = [p.id, sp?.id || ""].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const nx = nextBs(p.marriage_bs!, now);
    if (!nx || nx.days > ahead) return;
    const m = parts(p.marriage_bs)[0];
    const yrs = m ? nx.year - m : 0;
    upcoming.push({ kind: "anniversary", person: p, spouse: sp, days: nx.days, detail: yrs > 0 && yrs < 100 ? `${np(yrs)} औं वर्षगाँठ` : "वर्षगाँठ" });
  });

  const order = (a: FamilyEvent, b: FamilyEvent) => a.days - b.days || (b.own ? 1 : 0) - (a.own ? 1 : 0);
  return { own, upcoming: upcoming.sort(order), recent: recent.sort((a, b) => b.days - a.days) };
}

/** "आज", "भोलि", "३ दिनमा", "२ दिन अघि". */
export function whenLabel(days: number): string {
  if (days === 0) return "आज";
  if (days === 1) return "भोलि";
  if (days === -1) return "हिजो";
  return days > 0 ? `${np(days)} दिनमा` : `${np(-days)} दिन अघि`;
}

export { adToBsStr };
