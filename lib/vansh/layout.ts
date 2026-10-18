// Family-chart layout: turns the people list into positioned cards and connector lines.
// Ported from the original app.js (build / measure / rowOf / place / draw).
import type { VPerson } from "./types";
import type { Graph } from "./graph";

export const CW = 176;
export const CH = 72;
export const GAP = 16;
export const HG = 26;
export const VG = 64;
export const GEN = ["#E4572E", "#F3A712", "#29A19C", "#3A7CA5", "#7B5EA7", "#D1477A", "#5B8C5A", "#C17C3B"];

export interface TreeNode {
  p: VPerson;
  sps: VPerson[];
  d: number;
  w: number;
  all: TreeNode[];
  from?: string | null;
  vis: TreeNode[];
  ct: number;
  tw: number;
  ax: number;
}
export interface Card {
  p: VPerson;
  x: number;
  y: number;
  d: number;
}
export interface Line {
  d: string;
  c: string;
  m?: 1;
}
export interface Unit {
  key: string;
  px: number;
  y: number;
  n: number;
  open: boolean;
}
export interface Layout {
  cards: Card[];
  lines: Line[];
  units: Unit[];
  trees: TreeNode[];
  W: number;
  H: number;
  cardPos: Record<string, Card>;
}

function buildNode(g: Graph, p: VPerson, seen: Set<string>, d: number): TreeNode {
  const { byId, spousesOf, kidsOf, byBirth } = g;
  seen.add(p.id);
  const sps = spousesOf(p)
    .map((id) => byId[id])
    .filter((s, i, a) => !seen.has(s.id) && a.indexOf(s) === i);
  sps.forEach((s) => seen.add(s.id));
  const uniq = (a: VPerson[]) => [...new Map(a.map((k) => [k.id, k])).values()].sort(byBirth);
  const groups: { from: string | null; ks: VPerson[] }[] =
    sps.length >= 2
      ? [...sps.map((s) => ({ from: s.id, ks: uniq(kidsOf(s)) })), { from: null, ks: uniq(kidsOf(p)) }]
      : [{ from: null, ks: uniq([...kidsOf(p), ...(sps[0] ? kidsOf(sps[0]) : [])]) }];
  const all: TreeNode[] = [];
  groups.forEach((gr) =>
    gr.ks.forEach((k) => {
      if (!seen.has(k.id)) {
        const c = buildNode(g, k, seen, d + 1);
        c.from = gr.from;
        all.push(c);
      }
    })
  );
  return { p, sps, d, w: (sps.length + 1) * CW + sps.length * GAP, all, vis: [], ct: 0, tw: 0, ax: 0 };
}

function measure(n: TreeNode, collapsed: Set<string>) {
  n.vis = collapsed.has(n.p.id) ? [] : n.all;
  n.vis.forEach((c) => measure(c, collapsed));
  n.ct = n.vis.reduce((a, c) => a + c.tw, 0) + HG * Math.max(0, n.vis.length - 1);
  n.tw = Math.max(n.w, n.ct);
}

function rowOf(n: TreeNode): VPerson[] {
  const { p, sps } = n;
  if (!sps.length) return [p];
  if (sps.length === 1) {
    const s = sps[0];
    return p.gender === "F" && s.gender !== "F" ? [s, p] : [p, s];
  }
  return [sps[0], p, ...sps.slice(1)];
}

function place(n: TreeNode, x: number, y: number, cards: Card[], lines: Line[], units: Unit[]) {
  const row = rowOf(n);
  const ux = x + (n.tw - n.w) / 2;
  const px = ux + n.w / 2;
  const cx: Record<string, number> = {};
  row.forEach((q, i) => {
    const qx = ux + i * (CW + GAP);
    cards.push({ p: q, x: qx, y, d: n.d });
    cx[q.id] = qx + CW / 2;
  });
  const pi = row.indexOf(n.p);
  n.sps.forEach((s) => {
    const si = row.indexOf(s);
    if (Math.abs(si - pi) === 1) {
      const a = Math.min(si, pi);
      lines.push({ d: `M${ux + a * (CW + GAP) + CW} ${y + CH / 2}H${ux + (a + 1) * (CW + GAP)}`, c: n.p.id });
    } else {
      lines.push({ d: `M${cx[n.p.id]} ${y + CH}V${y + CH + 12}H${cx[s.id]}V${y + CH}`, c: n.p.id, m: 1 });
    }
  });
  n.ax = cx[n.p.id];
  if (n.all.length) units.push({ key: n.p.id, px, y, n: n.all.length, open: n.vis.length > 0 });
  let cur = x + (n.tw - n.ct) / 2;
  n.vis.forEach((c) => {
    const fx = n.sps.length >= 2 && c.from && cx[c.from] != null ? cx[c.from] : px;
    place(c, cur, y + CH + VG, cards, lines, units);
    lines.push({ d: `M${fx} ${y + CH}V${y + CH + VG / 2}H${c.ax}V${y + CH + VG}`, c: c.p.id });
    cur += c.tw + HG;
  });
}

function buildTrees(g: Graph): TreeNode[] {
  const seen = new Set<string>();
  const { people, hasParents, isMarriedIn, byBirth } = g;
  const trees = people
    .filter((p) => !hasParents(p) && !isMarriedIn(p))
    .sort(byBirth)
    .map((p) => buildNode(g, p, seen, 0));
  people.filter((p) => !seen.has(p.id)).forEach((p) => trees.push(buildNode(g, p, seen, 0)));
  return trees;
}

/** Initially folded branches: everything from generation 4 down. */
export function initialCollapsed(g: Graph): Set<string> {
  const c = new Set<string>();
  const f = (n: TreeNode) => {
    if (n.d >= 3 && n.all.length) c.add(n.p.id);
    n.all.forEach(f);
  };
  buildTrees(g).forEach(f);
  return c;
}

export function computeLayout(g: Graph, collapsed: Set<string>): Layout {
  const cards: Card[] = [];
  const lines: Line[] = [];
  const units: Unit[] = [];
  const trees = buildTrees(g);
  let x = 0;
  trees.forEach((t) => {
    measure(t, collapsed);
    place(t, x, 0, cards, lines, units);
    x += t.tw + HG * 3;
  });
  const W = Math.max(x - HG * 3, CW);
  const H = Math.max(CH, ...cards.map((c) => c.y + CH)) + 34;
  return { cards, lines, units, trees, W, H, cardPos: Object.fromEntries(cards.map((c) => [c.p.id, c])) };
}

/** "संक्षिप्त": keep the user's own branch open and fold the rest. */
export function compactCollapsed(layout: Layout, keep: Set<string> | null): Set<string> {
  const c = new Set<string>();
  const f = (n: TreeNode) => {
    const mine = !!keep && (keep.has(n.p.id) || n.sps.some((s) => keep.has(s.id)));
    if (!mine && (keep || n.d >= 1) && n.all.length) c.add(n.p.id);
    n.all.forEach(f);
  };
  layout.trees.forEach(f);
  return c;
}

/** Unfold every ancestor/spouse chain so that `id` becomes visible. */
export function openUp(g: Graph, collapsed: Set<string>, id: string | null | undefined, seen = new Set<string>()): Set<string> {
  const next = new Set(collapsed);
  const walk = (i?: string | null) => {
    const p = i ? g.byId[i] : undefined;
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    next.delete(p.id);
    walk(p.father_id);
    walk(p.mother_id);
    walk(p.spouse_id);
  };
  walk(id);
  return next;
}
