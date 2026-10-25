// Printing: a branch (or the whole accessible tree) as PDF pages.
//  1. Cascade pages (portrait): one person per row, children indented below the parent, flowed into columns.
//     Wherever a column starts inside a branch, a "↳ parent · पृ. x स्तं. y" line says where it continues from.
//  2. Chart pages (landscape, branch print only): the usual chart, tiled when it is wider than a page.
// jsPDF cannot shape Devanagari, so every page is drawn on a canvas by the browser and embedded as an image.
import type { VPerson } from "./types";
import { createGraph, type Graph } from "./graph";
import { GEN, POSTER_DIMS, computeLayout } from "./layout";
import { PGEN, POSTER_BG, POSTER_PAD, posterSvg } from "./poster";
import { planPosterPages, type PosterPage } from "./posterPlan";
import { np, yr } from "./text";
import { BRAND, NOTICE, wrapChars, type Stamp } from "./notice";

export const BRANCH_LEVELS = 7;
export type Paper = "a4" | "a3" | "a2";

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
 * People to print: the branch below `rootId`, its deepest generation plus the `levels - 1` above it, with spouses.
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

/** Depth-first outline order; every person on their own row, spouses on the same row. */
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

/** Whole accessible tree (every root, every generation). */
export function allRows(g: Graph): CascadeRow[] {
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
  for (const p of g.people) visit(p.id, 0, null);
  return rows;
}

// ------------------------------------------------------------------ column flow

export type Line = { kind: "row"; i: number } | { kind: "ctx"; parent: number };

/**
 * Fills columns of `cap` lines each. When a row's parent is not in the same column, a context line for that parent
 * is inserted once per column, so every column says which branch it continues.
 */
export function flowColumns(rows: Pick<CascadeRow, "parent">[], cap: number): Line[][] {
  const cols: Line[][] = [];
  let cur: Line[] = [];
  let inCur = new Set<number>();
  let ctxSeen = new Set<number>();
  const flush = () => {
    if (cur.length) cols.push(cur);
    cur = [];
    inCur = new Set();
    ctxSeen = new Set();
  };
  rows.forEach((r, i) => {
    for (;;) {
      const need = r.parent != null && !inCur.has(r.parent) && !ctxSeen.has(r.parent);
      if (cur.length + (need ? 2 : 1) <= Math.max(cap, 2)) {
        if (need) { cur.push({ kind: "ctx", parent: r.parent! }); ctxSeen.add(r.parent!); }
        cur.push({ kind: "row", i });
        inCur.add(i);
        return;
      }
      flush();
    }
  });
  flush();
  return cols;
}

// ------------------------------------------------------------------ drawing

const PAPER: Record<Paper, { w: number; h: number; dpi: number }> = {
  a4: { w: 210, h: 297, dpi: 300 },
  a3: { w: 297, h: 420, dpi: 300 },
  a2: { w: 420, h: 594, dpi: 200 },
};
const MIN_FS = 2.8; // mm (≈ 8 pt)
const MIN_SCALE = 0.2; // chart pages: smallest mm-per-pixel scale that keeps names readable (14px text ≈ 2.8 mm)
const F = '"Noto Sans Devanagari", sans-serif';

export interface PrintPage { url: string; thumb: string; w: number; h: number; label: string }
export interface PrintResult { blob: Blob; pages: PrintPage[]; cascadePages: number; chartPages: number }

export interface PrintJob {
  rows: CascadeRow[];
  can: (id: string) => boolean;
  nm: (p: VPerson) => string;
  paper: Paper;
  title: string;
  sub: string;
  firstLvl: number;
  stamp: Stamp;
  /** optional chart section (landscape pages after the cascade) */
  chart?: { people: VPerson[]; photos: Record<string, string> };
}

interface PageCtx { c: CanvasRenderingContext2D; cv: HTMLCanvasElement; pw: number; ph: number; mm: (v: number) => number }

function newCanvas(pw: number, ph: number, dpi: number): PageCtx {
  const mm = (v: number) => (v / 25.4) * dpi;
  const cv = document.createElement("canvas");
  cv.width = Math.round(mm(pw));
  cv.height = Math.round(mm(ph));
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  return { c, cv, pw, ph, mm };
}

/** Header (brand, title, subtitle) and footer (usage notice, signature, page number). Returns the content box in mm. */
function frame(x: PageCtx, job: PrintJob, n: number, total: number, extraRight?: string) {
  const { c, mm, pw, ph } = x;
  const M = 12, HEAD = 25, FOOT = 17;
  c.fillStyle = "#fff"; c.fillRect(0, 0, x.cv.width, x.cv.height);
  c.textBaseline = "alphabetic"; c.textAlign = "left";
  c.fillStyle = "#1F6F78"; c.font = `600 ${mm(3.6)}px ${F}`;
  c.fillText(BRAND, mm(M), mm(M + 3));
  c.fillStyle = "#1B2A2F"; c.font = `600 ${mm(7.5)}px ${F}`;
  c.fillText(job.title, mm(M), mm(M + 11.5));
  c.fillStyle = "#5C6C70"; c.font = `${mm(3.8)}px ${F}`;
  c.fillText(job.sub, mm(M), mm(M + 18));
  c.textAlign = "right";
  c.fillText(`पृष्ठ ${n} / ${total}${extraRight ? " · " + extraRight : ""}`, mm(pw - M), mm(M + 3));
  c.textAlign = "left";
  // footer
  c.strokeStyle = "#C5D0CC"; c.lineWidth = mm(0.25);
  c.beginPath(); c.moveTo(mm(M), mm(ph - M - FOOT + 1)); c.lineTo(mm(pw - M), mm(ph - M - FOOT + 1)); c.stroke();
  c.fillStyle = "#47565A"; c.font = `${mm(3.1)}px ${F}`;
  const per = Math.floor(((pw - 2 * M) / 3.1) * 1.75);
  const lines = [...wrapChars(NOTICE, per), ...wrapChars(job.stamp.line, per)];
  lines.forEach((l, i) => c.fillText(l, mm(M), mm(ph - M - FOOT + 5.5 + i * 3.9)));
  return { x: M, y: M + HEAD, w: pw - 2 * M, h: ph - M - HEAD - M - FOOT };
}

const shrink = (cv: HTMLCanvasElement, w = 900) => {
  const t = document.createElement("canvas");
  t.width = w;
  t.height = Math.round((cv.height / cv.width) * w);
  t.getContext("2d")!.drawImage(cv, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.8);
};

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("चार्ट बनाउन सकिएन")); };
    img.src = url;
  });
}

export async function renderPrint(job: PrintJob): Promise<PrintResult> {
  if ("fonts" in document) await (document as Document).fonts.ready.catch(() => {});
  const { rows, can, nm } = job;
  const paper = PAPER[job.paper];
  const label = (r: CascadeRow) => {
    const who = (p: VPerson) => (can(p.id) ? nm(p) : "🔒");
    const life = (p: VPerson) => (can(p.id) ? (yr(p.birth_bs) || "") + (p.is_living ? "" : "–" + (yr(p.death_bs) || "")) : "");
    return { name: who(r.p), life: life(r.p), sp: r.spouses.map((s) => who(s) + (life(s) ? " " + life(s) : "")).join(", ") };
  };
  const labels = rows.map(label);

  // ---- plan: fewest portrait pages that keep text at least MIN_FS
  const probe = newCanvas(10, 10, 72).c;
  probe.font = `1px ${F}`;
  const w1 = (t: string) => probe.measureText(t).width;
  const ctxText = (name: string) => `↳ ${name.length > 22 ? name.slice(0, 21) + "…" : name} · पृ. १२ स्तं. ३`;
  const maxW1 = Math.max(
    1,
    ...labels.map((l) => w1(`${l.name}  ${l.life}${l.sp ? "  ⚭ " + l.sp : ""}`)),
    ...labels.map((l) => w1(ctxText(l.name)))
  ) * 1.06;
  const maxLvl = Math.max(0, ...rows.map((r) => r.lvl));
  const M = 12, HEAD = 25, FOOT = 17, gap = 6;
  const aw = paper.w - 2 * M, ah = paper.h - M - HEAD - M - FOOT;
  type Plan = { fs: number; cols: number; pages: number; columns: Line[][] };
  const tryPlan = (pages: number): Plan | null => {
    let best: Plan | null = null;
    for (let cols = 1; cols <= 5; cols++) {
      const colW = (aw - gap * (cols - 1)) / cols;
      const fsW = Math.min((colW - 4) / (maxLvl * 1.7 + 2.2 + maxW1), 6);
      for (let fs = fsW; fs >= MIN_FS - 1e-6; fs -= 0.1) {
        const cap = Math.floor(ah / (fs * 1.45));
        const columns = flowColumns(rows, cap);
        if (columns.length <= pages * cols) {
          if (!best || fs > best.fs) best = { fs, cols, pages, columns };
          break;
        }
      }
    }
    return best;
  };
  let plan: Plan | null = null;
  for (let p = 1; p <= 14 && !plan; p++) plan = tryPlan(p);
  if (!plan) {
    const cols = 3, colW = (aw - gap * (cols - 1)) / cols, fs = MIN_FS, cap = Math.floor(ah / (fs * 1.45));
    void colW;
    const columns = flowColumns(rows, cap);
    plan = { fs, cols, pages: Math.ceil(columns.length / cols), columns };
  }
  const { fs, cols, columns } = plan;
  const pagesN = Math.max(1, Math.ceil(columns.length / cols));
  const rowH = fs * 1.45, indent = fs * 1.7, colW = (aw - gap * (cols - 1)) / cols;

  // chart section: split into poster pages (one branch per page, each says where it continues from)
  const lw = paper.h, lh = paper.w; // landscape
  const caw = lw - 2 * M, cah = lh - M - HEAD - M - FOOT;
  type PP = { page: PosterPage; img: HTMLImageElement; w: number; h: number; s: number; name: string; count: number };
  const posters: PP[] = [];
  const idxPage = job.chart ? 1 : 0; // index page before the posters
  if (job.chart && job.chart.people.length) {
    const sub = createGraph(job.chart.people.map((p) => ({ ...p })));
    const byId = Object.fromEntries(job.chart.people.map((p) => [p.id, p]));
    const who = (id: string) => (can(id) ? nm(byId[id]) : "🔒");
    for (const limit of [40, 30, 22, 16]) {
      const pages = planPosterPages(sub, limit);
      const abs = (i: number) => pagesN + 1 + i + 1; // PDF page number of poster i
      const built: { page: PosterPage; layout: ReturnType<typeof computeLayout> }[] = pages.map((pg) => {
        const inPage = new Set(pg.ids);
        const keep = (v?: string | null) => (v && inPage.has(v) ? v : null);
        // references leaving the page are cut, otherwise the page root would not count as a root
        const g2 = createGraph(pg.ids.map((id) => ({ ...byId[id], father_id: keep(byId[id].father_id), mother_id: keep(byId[id].mother_id), spouse_id: keep(byId[id].spouse_id), more_spouse_ids: (byId[id].more_spouse_ids || []).filter((x) => inPage.has(x)) })));
        return { page: pg, layout: computeLayout(g2, new Set(), POSTER_DIMS) };
      });
      const fits = built.every(({ layout }) => Math.min(caw / (layout.W + 2 * POSTER_PAD), cah / (layout.H + 46 + 120)) >= MIN_SCALE);
      if (!fits && limit !== 16) continue;
      posters.length = 0;
      for (const { page: pg, layout } of built) {
        const chips = Object.fromEntries(Object.entries(pg.cuts).map(([id, to]) => [id, `→ पृ. ${np(abs(to))}`]));
        const banner = pg.from ? `↳ ${who(pg.from.id)} बाट निरन्तर · पृ. ${np(abs(pg.from.page))} मा` : undefined;
        const svg = posterSvg(layout, can, nm, job.chart.photos, { bare: true, genOffset: job.firstLvl + pg.depth, chips, banner });
        const img = await svgImage(svg);
        const fit = Math.min(caw / img.width, cah / img.height, 0.5);
        posters.push({ page: pg, img, w: img.width * fit, h: img.height * fit, s: fit, name: pg.root ? who(pg.root) : "अन्य परिवार", count: pg.ids.length });
      }
      break;
    }
  }
  const chartN = posters.length ? posters.length + idxPage : 0;
  const total = pagesN + chartN;

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: job.paper, compress: true });
  pdf.setProperties({ title: `${BRAND} — ${job.title}`, subject: job.sub, author: job.stamp.who, keywords: `${BRAND}, ${job.stamp.id}`, creator: BRAND });
  const out: PrintPage[] = [];
  let pageNo = 0;
  const addPage = (x: PageCtx, lab: string, landscape: boolean) => {
    if (pageNo > 0) pdf.addPage(job.paper, landscape ? "landscape" : "portrait");
    pdf.addImage(x.cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, x.pw, x.ph);
    out.push({ url: "", thumb: shrink(x.cv), w: x.pw, h: x.ph, label: lab });
    pageNo++;
  };
  // first page orientation: portrait already set by constructor
  const where = new Map<number, number>(); // row index -> column index
  columns.forEach((col, ci) => col.forEach((l) => l.kind === "row" && where.set(l.i, ci)));

  for (let pg = 0; pg < pagesN; pg++) {
    const x = newCanvas(paper.w, paper.h, paper.dpi);
    const box = frame(x, job, pg + 1, total, "झरना ढाँचा");
    const { c, mm } = x;
    const pos = new Map<string, { x: number; y: number }>(); // "r<i>" / "c<col>:<parent>"
    columns.slice(pg * cols, pg * cols + cols).forEach((col, k) => {
      const ci = pg * cols + k;
      const cx = box.x + k * (colW + gap);
      col.forEach((l, slot) => pos.set(l.kind === "row" ? `r${l.i}` : `c${ci}:${l.parent}`, { x: cx, y: box.y + slot * rowH }));
    });
    // connectors
    c.strokeStyle = "#9AA9AB"; c.lineWidth = mm(0.25);
    columns.slice(pg * cols, pg * cols + cols).forEach((col, k) => {
      const ci = pg * cols + k;
      for (const l of col) {
        if (l.kind !== "row") continue;
        const r = rows[l.i];
        if (r.parent == null || r.lvl === 0) continue;
        const me = pos.get(`r${l.i}`)!;
        const src = where.get(r.parent) === ci ? pos.get(`r${r.parent}`) : pos.get(`c${ci}:${r.parent}`);
        if (!src) continue;
        const px0 = me.x + (r.lvl - 1) * indent + fs * 0.62;
        const cy = me.y + rowH / 2;
        c.beginPath(); c.moveTo(mm(px0), mm(src.y + rowH / 2 + fs * 0.35)); c.lineTo(mm(px0), mm(cy)); c.lineTo(mm(me.x + r.lvl * indent + fs * 0.3), mm(cy)); c.stroke();
      }
    });
    // lines
    columns.slice(pg * cols, pg * cols + cols).forEach((col, k) => {
      const ci = pg * cols + k;
      for (const l of col) {
        c.textBaseline = "middle";
        if (l.kind === "ctx") {
          const at = pos.get(`c${ci}:${l.parent}`)!;
          const pr = rows[l.parent], pc = where.get(l.parent) ?? 0;
          const pgIdx = Math.floor(pc / cols) + 1, colIdx = (pc % cols) + 1;
          const nmv = labels[l.parent].name;
          c.fillStyle = "#E7F1F2";
          c.fillRect(mm(at.x + pr.lvl * indent), mm(at.y + rowH * 0.1), mm(colW - pr.lvl * indent), mm(rowH * 0.8));
          c.fillStyle = "#1F6F78"; c.font = `italic 600 ${mm(fs * 0.82)}px ${F}`;
          c.fillText(`↳ ${nmv.length > 24 ? nmv.slice(0, 23) + "…" : nmv} · पृ. ${pgIdx} स्तं. ${colIdx} बाट निरन्तर`, mm(at.x + pr.lvl * indent + fs * 0.3), mm(at.y + rowH / 2));
          // dot where the connector starts
          c.fillStyle = "#9AA9AB"; c.beginPath(); c.arc(mm(at.x + pr.lvl * indent + fs * 0.62), mm(at.y + rowH / 2 + fs * 0.35), mm(0.35), 0, Math.PI * 2); c.fill();
          continue;
        }
        const r = rows[l.i], lab = labels[l.i], me = pos.get(`r${l.i}`)!;
        const xx = me.x + r.lvl * indent, cy = me.y + rowH / 2;
        c.fillStyle = GEN[(r.lvl + job.firstLvl) % GEN.length];
        c.fillRect(mm(xx), mm(me.y + rowH * 0.12), mm(fs * 0.16), mm(rowH * 0.76));
        c.fillStyle = r.p.gender === "M" ? "#4A78A8" : r.p.gender === "F" ? "#C0587A" : "#7A8C8F";
        c.beginPath(); c.arc(mm(xx + fs * 0.62), mm(cy), mm(fs * 0.3), 0, Math.PI * 2); c.fill();
        let tx = xx + fs * 1.1;
        c.fillStyle = r.p.is_living ? "#1B2A2F" : "#47565A"; c.font = `600 ${mm(fs)}px ${F}`;
        c.fillText(lab.name, mm(tx), mm(cy));
        tx += (c.measureText(lab.name).width / mm(1)) + fs * 0.5;
        if (lab.life) {
          c.fillStyle = "#5C6C70"; c.font = `${mm(fs * 0.85)}px ${F}`;
          c.fillText(lab.life, mm(tx), mm(cy));
          tx += (c.measureText(lab.life).width / mm(1)) + fs * 0.6;
        }
        if (lab.sp) {
          c.fillStyle = "#8A4A63"; c.font = `${mm(fs * 0.92)}px ${F}`;
          c.fillText("⚭ " + lab.sp, mm(tx), mm(cy));
        }
      }
    });
    addPage(x, `झरना ${pg + 1}`, false);
  }

  if (posters.length) {
    // index page
    const xi = newCanvas(lw, lh, paper.dpi);
    const bi = frame(xi, job, pagesN + 1, total, "चार्ट सूची");
    {
      const { c, mm } = xi;
      c.textBaseline = "alphabetic"; c.textAlign = "left";
      c.fillStyle = "#1F6F78"; c.font = `600 ${mm(4)}px ${F}`;
      c.fillText(posters.length === 1 ? "चार्ट अर्को पृष्ठमा छ।" : `चार्ट ${np(posters.length)} पृष्ठमा बाँडिएको छ — हरेक पृष्ठ एउटा शाखा हो र माथि "कहाँबाट निरन्तर" लेखिएको छ।`, mm(bi.x), mm(bi.y + 4));
      const rowH = 6.2, perCol = Math.max(1, Math.floor((bi.h - 12) / rowH)), colW = bi.w / Math.ceil(posters.length / perCol);
      posters.forEach((pp, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        const xx = bi.x + col * colW, yy = bi.y + 14 + row * rowH;
        c.fillStyle = PGEN[(pp.page.depth + job.firstLvl) % PGEN.length];
        c.beginPath(); c.arc(mm(xx + 1.6), mm(yy - 1.2), mm(1.4), 0, Math.PI * 2); c.fill();
        c.fillStyle = "#1B2A2F"; c.font = `600 ${mm(3.5)}px ${F}`;
        const label = `पृ. ${np(pagesN + 1 + i + 1)}  ${pp.name.length > 22 ? pp.name.slice(0, 21) + "…" : pp.name} · ${np(pp.count)} जना`;
        c.fillText(label, mm(xx + 5), mm(yy));
        if (pp.page.from) { c.fillStyle = "#5C6C70"; c.font = `${mm(3)}px ${F}`; c.fillText(`(पृ. ${np(pagesN + 1 + pp.page.from.page + 1)} बाट)`, mm(xx + 5 + colW * 0.62), mm(yy)); }
      });
    }
    addPage(xi, "चार्ट सूची", true);
    posters.forEach((pp, i) => {
      const x = newCanvas(lw, lh, paper.dpi);
      const box = frame(x, job, pagesN + idxPage + i + 1, total, `चार्ट · ${pp.name}`);
      const { c, mm } = x;
      c.fillStyle = POSTER_BG; c.fillRect(mm(box.x), mm(box.y), mm(box.w), mm(box.h));
      c.imageSmoothingQuality = "high";
      c.drawImage(pp.img, mm(box.x + (box.w - pp.w) / 2), mm(box.y + (box.h - pp.h) / 2), mm(pp.w), mm(pp.h));
      addPage(x, `चार्ट ${i + 1}`, true);
    });
  }
  return { blob: pdf.output("blob"), pages: out, cascadePages: pagesN, chartPages: chartN };
}

// ------------------------------------------------------------------ entry points

type Who = { can: (id: string) => boolean; nm: (p: VPerson) => string };

/** A branch: cascade pages (portrait) followed by chart pages. */
export async function branchPrint(g: Graph, rootId: string, w: Who, paper: Paper, stamp: Stamp, loadPh: (people: VPerson[]) => Promise<Record<string, string>>) {
  const sub = branchSubset(g, rootId);
  const rows = cascadeRows(g, rootId);
  const photos = await loadPh(sub.people);
  const root = g.byId[rootId];
  return renderPrint({
    rows, can: w.can, nm: w.nm, paper,
    title: `${w.can(rootId) ? w.nm(root) : "शाखा"} को शाखा`,
    sub: `${sub.levels} पुस्ता · ${sub.shown} जना · ${paper.toUpperCase()}`,
    firstLvl: sub.from, stamp, chart: { people: sub.people, photos },
  });
}

/** Everything the viewer may see: cascade pages, then the whole chart (overview page + tiles). */
export async function allPrint(g: Graph, w: Who, paper: Paper, stamp: Stamp, loadPh?: (people: VPerson[]) => Promise<Record<string, string>>) {
  const rows = allRows(g);
  const vis = g.people.filter((p) => w.can(p.id));
  return renderPrint({
    rows, can: w.can, nm: w.nm, paper, title: "पूर्ण वंशावली",
    sub: `${vis.length} जना · ${paper.toUpperCase()}`, firstLvl: 0, stamp,
    chart: { people: vis, photos: loadPh ? await loadPh(vis) : {} },
  });
}
