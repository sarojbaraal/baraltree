// Splits a big tree into poster pages of at most ~`limit` people. A page shows a branch from its root down as far as the
// limit allows; people at the bottom who still have descendants become the roots of further pages ("cuts").
import type { Graph } from "./graph";

export interface PosterPage {
  idx: number;
  /** person the page starts from (null for the bundle of small separate families) */
  root: string | null;
  ids: string[];
  /** cut person → page index that continues from them */
  cuts: Record<string, number>;
  /** page this one continues from (null for a top page) */
  from: { page: number; id: string } | null;
  /** generation of the root within the whole forest (0 = oldest) */
  depth: number;
}

/** a branch with at most this many people is never given a page of its own */
const MERGE = 12;

export function planPosterPages(g: Graph, limit = 40): PosterPage[] {
  const pages: PosterPage[] = [];
  const withSpouses = (ids: Iterable<string>) => {
    const s = new Set<string>(ids);
    for (const id of [...s]) for (const sp of g.spousesOf(g.byId[id])) if (g.byId[sp]) s.add(sp);
    return s;
  };
  /** people at depth <= L below root, by level */
  const levels = (rootId: string) => {
    const lv: string[][] = [[rootId]];
    const seen = new Set([rootId]);
    for (;;) {
      const next: string[] = [];
      for (const id of lv[lv.length - 1])
        for (const sp of [g.byId[id], ...g.spousesOf(g.byId[id]).map((x) => g.byId[x])])
          if (sp) for (const k of g.kidsOf(sp).sort(g.byBirth)) if (!seen.has(k.id)) { seen.add(k.id); next.push(k.id); }
      if (!next.length) break;
      lv.push(next);
    }
    return lv;
  };
  const plan = (rootId: string, from: PosterPage["from"], depth: number): number => {
    const page: PosterPage = { idx: pages.length, root: rootId, ids: [], cuts: {}, from, depth };
    pages.push(page);
    const lv = levels(rootId);
    let L = lv.length - 1;
    const count = (l: number) => withSpouses(lv.slice(0, l + 1).flat()).size;
    const wide = (l: number) => withSpouses(lv[l]).size > 11; // a row wider than ~11 cards gets unreadably small
    while (L > 1 && (count(L) > limit || wide(L))) L--;
    const ids = withSpouses(lv.slice(0, L + 1).flat());
    if (L < lv.length - 1) {
      for (const id of lv[L]) {
        const sub = levels(id);
        const total = withSpouses(sub.flat()).size;
        if (sub.length === 1) continue; // no descendants
        // a small remainder stays on this page instead of a page of its own
        if (total <= MERGE) withSpouses(sub.flat()).forEach((x) => ids.add(x));
        else page.cuts[id] = plan(id, { page: page.idx, id }, depth + L);
      }
    }
    // drop anyone who would float free on the page (no parent, no spouse here)
    page.ids = [...ids].filter((id) => {
      const p = g.byId[id];
      if (id === rootId) return true;
      return (p.father_id && ids.has(p.father_id)) || (p.mother_id && ids.has(p.mother_id)) || g.spousesOf(p).some((x) => ids.has(x) && x !== id);
    });
    return page.idx;
  };
  const roots = g.people.filter((p) => !g.hasParents(p) && !g.isMarriedIn(p)).sort(g.byBirth);
  const size = (id: string) => withSpouses(levels(id).flat()).size;
  const small: string[] = [];
  for (const r of roots) {
    if (size(r.id) > 6 || roots.length === 1) plan(r.id, null, 0);
    else small.push(...withSpouses(levels(r.id).flat()));
  }
  // separate small families share pages
  for (let i = 0; i < small.length; i += limit)
    pages.push({ idx: pages.length, root: null, ids: small.slice(i, i + limit), cuts: {}, from: null, depth: 0 });
  return pages;
}
