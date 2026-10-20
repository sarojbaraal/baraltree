// Kinship labels and family grouping (ported from the original app.js: relMap, relsOf, famGroups, genNo).
import type { VPerson, VProfile } from "./types";
import type { Graph, Perms } from "./graph";
import { kinFor, kinFrom } from "./kinship";

/**
 * Relationship of everyone to the signed-in user ("तपाईं"), as Nepali kinship terms (see ./kinship.ts).
 * R: id → label; C: ids of the immediate family.
 */
export function relMap(g: Graph, me: VProfile | null): { R: Record<string, string>; C: Set<string> } {
  const { R, C } = kinFor(g.people, me);
  return { R, C };
}

/** Immediate relations of p (as p sees them), in display order. */
export function relsOf(g: Graph, p: VPerson): { q: VPerson; l: string }[] {
  const { byId, spousesOf, kidsOf, byBirth, sibsOf } = g;
  const { R } = kinFrom(g.people, p.id);
  const out: { q: VPerson; l: string }[] = [];
  const add = (q: VPerson | undefined | null) => {
    if (q && R[q.id]) out.push({ q, l: R[q.id] });
  };
  add(p.father_id ? byId[p.father_id] : undefined);
  add(p.mother_id ? byId[p.mother_id] : undefined);
  spousesOf(p).forEach((i) => add(byId[i]));
  sibsOf(p).sort(byBirth).forEach(add);
  kidsOf(p).sort(byBirth).forEach(add);
  return out;
}

/** Generation number (1 = root). `depthOf` supplies tree depth when the chart has been laid out. */
export function genNo(g: Graph, id: string, depthOf?: (id: string) => number | undefined, n = 0): number {
  const d = depthOf?.(id);
  if (d !== undefined) return d + 1;
  const p = g.byId[id];
  if (!p || n > 40) return 1;
  const par = (p.father_id && g.byId[p.father_id]) || (p.mother_id && g.byId[p.mother_id]);
  if (par) return genNo(g, par.id, depthOf, n + 1) + 1;
  const s = g.isMarriedIn(p) && p.spouse_id ? g.byId[p.spouse_id] : null;
  return s ? genNo(g, s.id, depthOf, n + 1) : 1;
}

export interface FamGroup {
  title: string;
  members: VPerson[];
}

/** Grouping used on the "परिवार" tab. */
export function famGroups(g: Graph, me: VProfile, perms: Perms, RM: Record<string, string>): FamGroup[] {
  const { people, byId, spousesOf, kidsOf, byBirth, branchOf, downSet, sibsOf } = g;
  const { can } = perms;
  const pos = (id?: string | null) => (id ? byId[id] : undefined);
  const a = pos(me.position_person_id) || pos(me.position_parent_id) || pos(me.position_grand_id);
  const used = new Set<string>();
  const take = (arr: (VPerson | undefined)[]): VPerson[] =>
    arr.filter((p): p is VPerson => !!p && can(p.id) && !used.has(p.id) && !!used.add(p.id));
  const sp = (p: VPerson) => spousesOf(p).map((i) => byId[i]);
  const G: FamGroup[] = [];
  const sibs = (x: VPerson) => sibsOf(x).sort(byBirth);
  const fam = (x: VPerson) => [x, ...sp(x), ...kidsOf(x).sort(byBirth)];
  const marF = (x: VPerson) => x.gender === "F" && spousesOf(x).length > 0;

  if (a) {
    const f = pos(a.father_id);
    const m = pos(a.mother_id);
    const ks = kidsOf(a).sort(byBirth);
    const sons = ks.filter((k) => k.gender !== "F");
    const ds = ks.filter((k) => k.gender === "F");
    const ud = ds.filter((k) => !spousesOf(k).length);
    const gk = sons.flatMap((x) => kidsOf(x).sort(byBirth));
    G.push({
      title: "🏠अहिलेको परिवार",
      members: take([
        pos(f?.father_id), pos(f?.mother_id), f, m, a, ...sp(a), ...sons, ...sons.flatMap(sp), ...ud,
        ...gk.filter((k) => k.gender !== "F"),
        ...gk.filter((k) => k.gender === "F" && !spousesOf(k).length),
      ]),
    });
    const unc = f ? sibs(f).filter((y) => y.gender !== "F") : [];
    const bro = sibs(a).filter((y) => !marF(y));
    G.push({
      title: "💞 विवाहित छोरी-ज्वाइँ र भान्जा-भान्जी",
      members: take(
        [
          ...ds.filter(marF),
          ...gk.filter(marF),
          ...sibs(a).filter(marF),
          ...unc.flatMap((u) => kidsOf(u).filter(marF)),
        ].flatMap(fam)
      ),
    });
    const inl = a.gender === "F" ? sp(a).flatMap((h) => (h ? sibs(h).flatMap(fam) : [])) : [];
    G.push({
      title: "👬 दाजुभाइ, काका-काकी र भतिजा-भतिजी",
      members: take([
        ...bro.flatMap(fam),
        ...unc.flatMap((u) => [u, ...sp(u), ...kidsOf(u).sort(byBirth).flatMap((k) => (marF(k) ? [] : fam(k)))]),
        ...inl,
      ]),
    });
    const rest = people.filter((p) => can(p.id) && !used.has(p.id)).sort(byBirth);
    const side = (r?: VPerson) => {
      const s = new Set<string>();
      if (!r) return s;
      branchOf([r.id]).forEach((i) => s.add(i));
      const gp = pos(r.father_id) || pos(r.mother_id);
      if (gp) downSet(gp.id).forEach((i) => s.add(i));
      return s;
    };
    const P = side(f);
    const M = side(m);
    const bk = (p: VPerson) => (P.has(p.id) ? 0 : M.has(p.id) ? 1 : RM[p.id] ? 2 : p.is_living ? 3 : 4);
    [
      "🌿 बाबुपट्टिका आफन्त",
      "🌸 आमापट्टिका आफन्त (मामाली)",
      "🔗 स्पष्ट साइनो भएका अन्य सदस्य",
      "❔ साइनो स्पष्ट नभएका सदस्य",
      "🕊 साइनो स्पष्ट नभएका दिवंगत सदस्य",
    ].forEach((title, k) => G.push({ title, members: rest.filter((p) => bk(p) === k) }));
  } else {
    G.push({ title: "👥 सबै सदस्य", members: people.filter((p) => can(p.id)).sort(byBirth) });
  }
  return G;
}
