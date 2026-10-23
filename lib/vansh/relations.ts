// Kinship labels and family grouping (ported from the original app.js: relMap, relsOf, famGroups, genNo).
import type { VPerson, VProfile } from "./types";
import type { Graph, Perms } from "./graph";
import { kinFor, kinFrom } from "./kinship";
import { surnameOf } from "./text";

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

export const GROUP_MAIN = "मुख्य परिवार";
export const GROUP_EXTRA = "एकाघरका थप परिवार";
export const GROUP_DAUGHTERS = "छोरी-चेली तथा भान्जा-भान्जीहरु";
export const GROUP_MAWALI = "मावली पट्टीका आफन्तहरु";
export const GROUP_13 = ["१३ दिने बुबा पुस्ता", "१३ दिने दाजू-भाई पुस्ता", "१३ दिने छोरा-नाति पुस्ता"] as const;
const BARAL = "बराल";

/**
 * Grouping used on the "परिवार" tab. A person belongs to exactly one group (first match wins):
 *  1. मुख्य परिवार            — the household of A (A = the user; for a married woman, her husband's household)
 *  2. एकाघरका थप परिवार        — the rest of the grandfather's household (his sons/wives, other grandsons and their families)
 *  3. छोरी-चेली तथा भान्जा-भान्जी — married daughters of groups 1–2, their husbands and children (with spouses)
 *  4. मावली पट्टीका आफन्तहरु     — everyone connected through A's mother's parents
 *  5–7. १३ दिने पुस्ता          — remaining men with surname बराल, by generation (father / brother / son-grandson)
 */
export function famGroups(g: Graph, me: VProfile, perms: Perms, _RM?: Record<string, string>): FamGroup[] {
  const { people, byId, spousesOf, kidsOf, byBirth, sibsOf, downSet } = g;
  const { can } = perms;
  const pos = (id?: string | null) => (id ? byId[id] : undefined);
  const a0 = pos(me.position_person_id) || pos(me.position_parent_id) || pos(me.position_grand_id);
  const used = new Set<string>();
  const take = (arr: (VPerson | undefined)[]): VPerson[] =>
    arr.filter((p): p is VPerson => !!p && can(p.id) && !used.has(p.id) && !!used.add(p.id));
  const sp = (p: VPerson) => spousesOf(p).map((i) => byId[i]).filter(Boolean) as VPerson[];
  const sort = (l: VPerson[]) => [...l].sort(byBirth);
  const kids = (p: VPerson) => sort(kidsOf(p));
  const sons = (p: VPerson) => kids(p).filter((k) => k.gender !== "F");
  const daus = (p: VPerson) => kids(p).filter((k) => k.gender === "F");
  const unmarried = (p: VPerson) => !spousesOf(p).length;
  const married = (p: VPerson) => spousesOf(p).length > 0;
  const G: FamGroup[] = [];
  if (!a0) return [{ title: "👥 सबै सदस्य", members: people.filter((p) => can(p.id)).sort(byBirth) }];

  // a married woman's family is her husband's
  const husband = a0.gender === "F" ? sp(a0).find((h) => h.gender !== "F") : undefined;
  const X = husband || a0;
  const f = pos(X.father_id);
  const m = pos(X.mother_id);
  const gf = pos(f?.father_id);
  const gm = pos(f?.mother_id);

  // ---- 1. मुख्य परिवार
  const gsons = sons(X).flatMap(sons);
  const gkids = sons(X).flatMap(kids);
  G.push({
    title: GROUP_MAIN,
    members: take([
      gf, gm, f, m, X, ...sp(X), a0,
      ...sons(X), ...sons(X).flatMap(sp),
      ...daus(X).filter(unmarried),
      ...sort(sibsOf(X)).filter(unmarried),
      ...gsons, ...gsons.flatMap(sp),
      ...gkids.filter((k) => k.gender === "F" && unmarried(k)),
    ]),
  });

  // ---- 2. एकाघरका थप परिवार: the grandfather's other sons, other grandsons and their families
  const root = gf;
  if (root) {
    const uncles = sons(root);
    const grandsons = uncles.flatMap(sons).filter((b) => b.id !== X.id);
    const grandDaus = uncles.flatMap(daus).filter((d) => unmarried(d) && d.id !== X.id);
    const fam = (b: VPerson) => [
      b, ...sp(b),
      ...sons(b), ...sons(b).flatMap(sp),
      ...daus(b).filter(unmarried),
      ...sons(b).flatMap(sons), ...sons(b).flatMap(sons).flatMap(sp),
      ...sons(b).flatMap(daus).filter(unmarried),
    ];
    G.push({
      title: GROUP_EXTRA,
      members: take([
        ...uncles, ...uncles.flatMap(sp),
        ...daus(root).filter(unmarried),
        ...sort(grandsons).flatMap(fam),
        ...sort(grandDaus),
      ]),
    });
  } else G.push({ title: GROUP_EXTRA, members: [] });

  // ---- 3. छोरी-चेली तथा भान्जा-भान्जीहरु
  const inside = [...G[0].members, ...G[1].members];
  const mdaus = inside.flatMap(daus).filter((d, i, l) => married(d) && l.indexOf(d) === i);
  const fam3 = (d: VPerson) => [
    d, ...sp(d),
    ...kids(d).flatMap((k) => [k, ...sp(k)]),
  ];
  G.push({ title: GROUP_DAUGHTERS, members: take(mdaus.flatMap(fam3)) });

  // ---- 4. मावली पट्टीका आफन्तहरु
  const kin = kinFrom(people, X.id);
  const mw = new Set<string>();
  Object.entries(kin.paths).forEach(([id, p]) => /^m[fm]/.test(p) && mw.add(id));
  [pos(m?.father_id), pos(m?.mother_id)].forEach((r) => r && downSet(r.id).forEach((i) => mw.add(i)));
  G.push({ title: GROUP_MAWALI, members: take(sort(people.filter((p) => mw.has(p.id)))) });

  // ---- 5–7. १३ दिने पुस्ता (बराल थर भएका पुरुष)
  const gen = (id: string): number | null => {
    const p = kin.paths[id];
    if (p === undefined) return null;
    let d = 0;
    for (const c of p) d += c === "s" || c === "d" ? 1 : c === "f" || c === "m" ? -1 : 0;
    return d;
  };
  const baral = sort(people.filter((p) => p.gender === "M" && surnameOf(p.name) === BARAL));
  G.push({ title: GROUP_13[0], members: take(baral.filter((p) => gen(p.id) === -1)) });
  G.push({ title: GROUP_13[1], members: take(baral.filter((p) => gen(p.id) === 0)) });
  G.push({ title: GROUP_13[2], members: take(baral.filter((p) => (gen(p.id) ?? 0) >= 1)) });
  return G;
}
