// Branch print: the last N generations of one person's branch, as an A3 landscape PDF.
// jsPDF cannot shape Devanagari, so the page is drawn on a canvas by the browser and embedded as an image.
import type { VPerson } from "./types";
import type { Graph } from "./graph";
import { GEN } from "./layout";
import { yr } from "./text";

export const BRANCH_LEVELS = 7;

/** Descendants of `rootId` with depth (0 = the person). */
function depths(g: Graph, rootId: string): Map<string, number> {
  const d = new Map<string, number>([[rootId, 0]]);
  const q = [rootId];
  while (q.length) {
    const id = q.shift()!;
    for (const k of g.kidsOf(g.byId[id])) if (!d.has(k.id)) { d.set(k.id, d.get(id)! + 1); q.push(k.id); }
  }
  return d;
}

/**
 * People to print: take the branch below `rootId`, find its deepest generation, and keep that generation
 * plus the `levels - 1` above it (spouses ride along). Parent links that leave the set are cut so the
 * top generation lays out as roots.
 */
export function branchSubset(g: Graph, rootId: string, levels = BRANCH_LEVELS) {
  const d = depths(g, rootId);
  const maxDepth = Math.max(...d.values());
  const from = Math.max(0, maxDepth - (levels - 1));
  const keep = new Set<string>();
  for (const [id, dep] of d) if (dep >= from) keep.add(id);
  for (const id of [...keep]) for (const s of g.spousesOf(g.byId[id])) keep.add(s);
  const people = [...keep].map((id) => g.byId[id]);
  return { people, maxDepth, from, count: d.size, shown: keep.size, levels: maxDepth - from + 1 };
}

export interface CascadeRow {
  p: VPerson;
  spouses: VPerson[];
  /** 0 = top printed generation */
  lvl: number;
  /** index of the parent row (null for the top generation) */
  parent: number | null;
}

/**
 * Cascade (outline) order: every person on their own row, children directly below the parent and indented one step.
 * A wide chart becomes a tall list, which can then be flowed into columns to fill the page.
 */
export function cascadeRows(g: Graph, rootId: string, levels = BRANCH_LEVELS): CascadeRow[] {
  const { from } = branchSubset(g, rootId, levels);
  const rows: CascadeRow[] = [];
  const seen = new Set<string>();
  const visit = (id: string, dep: number, parentRow: number | null) => {
    const p = g.byId[id];
    if (seen.has(id)) return;
    seen.add(id);
    let me = parentRow;
    if (dep >= from) {
      const spouses = g.spousesOf(p).map((x) => g.byId[x]).filter((x) => x && !seen.has(x.id));
      spouses.forEach((x) => seen.add(x.id));
      rows.push({ p, spouses, lvl: dep - from, parent: parentRow });
      me = rows.length - 1;
    }
    for (const k of g.kidsOf(p).sort(g.byBirth)) visit(k.id, dep + 1, me);
  };
  visit(rootId, 0, null);
  return rows;
}

export type Paper = "a4" | "a3" | "a2";
const PAPER: Record<Paper, { w: number; h: number; dpi: number }> = {
  a4: { w: 297, h: 210, dpi: 300 },
  a3: { w: 420, h: 297, dpi: 300 },
  a2: { w: 594, h: 420, dpi: 200 },
};
const MIN_FS = 2.8; // mm (≈ 8 pt): smallest text we accept on a page

interface Placed { row: number; col: number; slot: number; ctx?: boolean }

/** Best column layout for `n` rows on one page: biggest font that fits both height and width. */
function planPage(n: number, maxW1: number, maxLvl: number, aw: number, ah: number) {
  let best = { cols: 1, fs: 0, rows: n };
  for (let cols = 1; cols <= 8; cols++) {
    const rowsPer = Math.ceil(n / cols) + 1; // +1: room for a "continued" row
    const gap = 6;
    const colW = (aw - gap * (cols - 1)) / cols;
    const fsH = ah / rowsPer / 1.45;
    const fsW = (colW - 4) / (maxLvl * 1.7 + 2.2 + maxW1);
    const fs = Math.min(fsH, fsW, 6);
    if (fs > best.fs) best = { cols, fs, rows: rowsPer };
  }
  return best;
}

export async function branchPdf(
  g: Graph, rootId: string, can: (id: string) => boolean, nm: (p: VPerson) => string, paper: Paper = "a3"
): Promise<{ blob: Blob; info: ReturnType<typeof branchSubset> & { pages: number } }> {
  const info = branchSubset(g, rootId);
  const rows = cascadeRows(g, rootId);
  const root = g.byId[rootId];
  const out = await cascadePdf({
    rows, can, nm, paper, firstLvl: info.from,
    title: `${can(root.id) ? nm(root) : "🔒"} को वंशावली शाखा`,
    sub: `तल्लो पुस्ताबाट माथि ${info.levels} पुस्ता · ${info.shown} जना`,
  });
  return { blob: out.blob, info: { ...info, pages: out.pages } };
}

/** Whole accessible tree (every root, every generation) as a cascade. */
export async function allPdf(g: Graph, can: (id: string) => boolean, nm: (p: VPerson) => string, paper: Paper) {
  const rows: CascadeRow[] = [];
  const seen = new Set<string>();
  const visit = (id: string, lvl: number, parent: number | null) => {
    const p = g.byId[id];
    if (!p || seen.has(id)) return;
    seen.add(id);
    const spouses = g.spousesOf(p).map((x) => g.byId[x]).filter((x) => x && !seen.has(x.id));
    spouses.forEach((x) => seen.add(x.id));
    rows.push({ p, spouses, lvl, parent });
    const me = rows.length - 1;
    for (const k of g.kidsOf(p).sort(g.byBirth)) visit(k.id, lvl + 1, me);
  };
  for (const p of g.people.filter((x) => !g.hasParents(x) && !g.isMarriedIn(x)).sort(g.byBirth)) visit(p.id, 0, null);
  for (const p of g.people) visit(p.id, 0, null); // anything left over (cycles / orphans)
  return cascadePdf({ rows, can, nm, paper, firstLvl: 0, title: "वंशावली", sub: `${g.people.length} जना` });
}

interface CascadeOpts {
  rows: CascadeRow[]; can: (id: string) => boolean; nm: (p: VPerson) => string; paper: Paper;
  title: string; sub: string; firstLvl: number;
}

async function cascadePdf({ rows, can, nm, paper, title, sub, firstLvl }: CascadeOpts): Promise<{ blob: Blob; pages: number }> {
  const A3 = PAPER[paper];
  const DPI = A3.dpi;
  const mm = (v: number) => (v / 25.4) * DPI;
  if ("fonts" in document) await (document as Document).fonts.ready.catch(() => {});

  const W = Math.round(mm(A3.w)), H = Math.round(mm(A3.h));
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  const F = '"Noto Sans Devanagari", sans-serif';
  const M = 12, HEAD = 22, FOOT = 7; // mm
  const aw = A3.w - 2 * M, ah = A3.h - M - HEAD - FOOT - M;

  const label = (r: CascadeRow) => {
    const who = (p: VPerson) => (can(p.id) ? nm(p) : "🔒");
    const life = (p: VPerson) => (can(p.id) ? (yr(p.birth_bs) || "") + (p.is_living ? "" : "–" + (yr(p.death_bs) || "")) : "");
    return { name: who(r.p), life: life(r.p), sp: r.spouses.map((s) => who(s) + (life(s) ? " " + life(s) : "")).join(", ") };
  };
  const labels = rows.map(label);
  // text width at a 1 mm font
  c.font = `1px ${F}`;
  const maxW1 = Math.max(1, ...labels.map((l) => c.measureText(`${l.name}  ${l.life}${l.sp ? "  ⚭ " + l.sp : ""}`).width)) * 1.08;
  const maxLvl = Math.max(0, ...rows.map((r) => r.lvl));

  // pages: the fewest pages that keep text legible
  let pages = 1;
  while (pages < 12 && planPage(Math.ceil(rows.length / pages), maxW1, maxLvl, aw, ah).fs < MIN_FS) pages++;
  const per = Math.ceil(rows.length / pages);
  const plan = planPage(per, maxW1, maxLvl, aw, ah);
  const fs = plan.fs, rowH = fs * 1.45, indent = fs * 1.7;
  const gap = 6, colW = (aw - gap * (plan.cols - 1)) / plan.cols;
  const perCol = Math.ceil(per / plan.cols);

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: paper, compress: true });
  const date = new Date().toISOString().slice(0, 10);
  const P = mm;

  for (let pg = 0; pg < pages; pg++) {
    c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.textAlign = "left";
    c.fillStyle = "#1B2A2F"; c.font = `600 ${P(8)}px ${F}`;
    c.fillText(title, P(M), P(M + 8));
    c.fillStyle = "#5C6C70"; c.font = `${P(4.2)}px ${F}`;
    c.fillText(`${sub} · हाम्रो वंशावली · ${date}`, P(M), P(M + 15));
    if (pages > 1) { c.textAlign = "right"; c.fillText(`पृष्ठ ${pg + 1} / ${pages}`, P(A3.w - M), P(M + 8)); c.textAlign = "left"; }

    const start = pg * per, end = Math.min(rows.length, start + per);
    // slot of each row on this page: column + position (continuation rows take slot 0 of a column)
    const pos = new Map<number, { x: number; y: number }>();
    for (let i = start; i < end; i++) {
      const k = i - start, col = Math.floor(k / perCol), first = start + col * perCol;
      const slot = k % perCol + (col > 0 && rows[first].parent != null ? 1 : 0);
      pos.set(i, { x: M + col * (colW + gap), y: M + HEAD + slot * rowH });
    }
    // continuation rows: where a column starts mid-branch, show whose children continue
    const cont: { col: number; text: string; lvl: number }[] = [];
    for (let col = 1; col < plan.cols; col++) {
      const i = start + col * perCol;
      if (i >= end) break;
      const r = rows[i];
      if (r.parent != null) cont.push({ col, text: "↳ " + labels[r.parent].name + " (निरन्तर)", lvl: Math.max(0, r.lvl - 1) });
    }

    // connectors
    c.strokeStyle = "#9AA9AB"; c.lineWidth = P(0.25);
    for (let i = start; i < end; i++) {
      const r = rows[i], me = pos.get(i)!;
      const cx = me.x + r.lvl * indent + fs * 0.5, cy = me.y + rowH / 2;
      if (r.parent != null && r.lvl > 0) {
        const pp = pos.get(r.parent);
        const px0 = me.x + (r.lvl - 1) * indent + fs * 0.5;
        const top = pp && pp.x === me.x ? pp.y + rowH / 2 + fs * 0.45 : me.y - (rowH * 0.5);
        c.beginPath(); c.moveTo(P(px0), P(top)); c.lineTo(P(px0), P(cy)); c.lineTo(P(cx - fs * 0.5), P(cy)); c.stroke();
      }
    }
    // rows
    for (let i = start; i < end; i++) {
      const r = rows[i], l = labels[i], me = pos.get(i)!;
      const x = me.x + r.lvl * indent, cy = me.y + rowH / 2;
      const dot = r.p.gender === "M" ? "#4A78A8" : r.p.gender === "F" ? "#C0587A" : "#7A8C8F";
      c.fillStyle = GEN[(r.lvl + firstLvl) % GEN.length];
      c.fillRect(P(x), P(me.y + rowH * 0.12), P(fs * 0.16), P(rowH * 0.76));
      c.fillStyle = dot; c.beginPath(); c.arc(P(x + fs * 0.62), P(cy), P(fs * 0.3), 0, Math.PI * 2); c.fill();
      let tx = x + fs * 1.1;
      c.textBaseline = "middle";
      c.fillStyle = r.p.is_living ? "#1B2A2F" : "#47565A";
      c.font = `600 ${P(fs)}px ${F}`;
      c.fillText(l.name, P(tx), P(cy));
      tx += c.measureText(l.name).width / DPI * 25.4 + fs * 0.5;
      if (l.life) {
        c.fillStyle = "#5C6C70"; c.font = `${P(fs * 0.85)}px ${F}`;
        c.fillText(l.life, P(tx), P(cy));
        tx += c.measureText(l.life).width / DPI * 25.4 + fs * 0.6;
      }
      if (l.sp) {
        c.fillStyle = "#8A4A63"; c.font = `${P(fs * 0.92)}px ${F}`;
        c.fillText("⚭ " + l.sp, P(tx), P(cy));
      }
    }
    c.textBaseline = "middle"; c.fillStyle = "#7A8C8F"; c.font = `italic ${P(fs * 0.85)}px ${F}`;
    for (const k of cont) c.fillText(k.text, P(M + k.col * (colW + gap) + k.lvl * indent), P(M + HEAD + rowH / 2));
    if (pg > 0) pdf.addPage(paper, "landscape");
    pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, A3.w, A3.h);
  }
  return { blob: pdf.output("blob"), pages };
}
