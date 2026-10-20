// Thin adapter for the legacy (site) profile panel. The real engine lives in lib/vansh/kinship.ts.
import type { Person } from "@/types/database";
import type { VPerson } from "@/lib/vansh/types";
import { kinshipBetween } from "@/lib/vansh/kinship";

export interface KinshipResult {
  term_ne: string;
  term_en: string;
}

const g = (x: string) => (/^(m|male|पुरुष)$/i.test(x) ? "M" : /^(f|female|महिला)$/i.test(x) ? "F" : "O");

/** What `source` is to `target` (e.g. source = target's father → "बुबा"). */
export function resolveNepaliKinship(source: Person, target: Person, peopleMap: Map<string, Person>): KinshipResult {
  if (source.id === target.id) return { term_ne: "तपाईं", term_en: "Self" };
  const people = [...peopleMap.values()].map(
    (p) => ({ ...p, gender: g(p.gender), created_at: p.created_at || "" }) as unknown as VPerson
  );
  return { term_ne: kinshipBetween({ people }, target.id, source.id) ?? "नातेदार", term_en: "Relative" };
}
