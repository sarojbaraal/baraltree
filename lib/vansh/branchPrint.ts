// Branch print: the last N generations of one person's branch, as an A3 landscape PDF.
// jsPDF cannot shape Devanagari, so the page is drawn on a canvas by the browser and embedded as an image.
import type { VPerson } from "./types";
import { createGraph, type Graph } from "./graph";
import { computeLayout } from "./layout";
import { svgText } from "./exporters";

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
  const people: VPerson[] = [...keep].map((id) => {
    const p = g.byId[id];
    return { ...p, father_id: p.father_id && keep.has(p.father_id) ? p.father_id : null, mother_id: p.mother_id && keep.has(p.mother_id) ? p.mother_id : null };
  });
  return { people, maxDepth, from, count: d.size, shown: keep.size, levels: maxDepth - from + 1 };
}

const A3 = { w: 420, h: 297 }; // mm, landscape
const DPI = 300;
/** Smallest chart scale that still prints legible names on A3 (card ≈ 22 mm wide). */
const MIN_SCALE = 1.5;
const px = (mm: number) => Math.round((mm / 25.4) * DPI);

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("चार्ट बनाउन सकिएन")); };
    img.src = url;
  });
}

export async function branchPdf(
  g: Graph, rootId: string, can: (id: string) => boolean, nm: (p: VPerson) => string
): Promise<{ blob: Blob; info: ReturnType<typeof branchSubset> & { pages: number } }> {
  const info = branchSubset(g, rootId);
  const sub = createGraph(info.people);
  const layout = computeLayout(sub, new Set());
  const img = await svgImage(svgText(layout, can, nm));
  if ("fonts" in document) await (document as Document).fonts.ready.catch(() => {});
  const W = px(A3.w), H = px(A3.h), M = px(12), HEAD = px(24), FOOT = px(8);
  const aw = W - 2 * M, ah = H - M - HEAD - FOOT - M;
  // Small branches fit one page. Wide ones keep a readable card size and continue over more pages.
  const fit = Math.min(aw / img.width, ah / img.height, 3);
  const s = Math.max(fit, MIN_SCALE);
  const dw = img.width * s, dh = img.height * s;
  const cols = Math.max(1, Math.ceil(dw / aw - 1e-6)), rows = Math.max(1, Math.ceil(dh / ah - 1e-6));
  const total = cols * rows;
  const F = '"Noto Sans Devanagari", sans-serif';
  const root = g.byId[rootId];
  const date = new Date().toISOString().slice(0, 10);

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  if (!c) throw new Error("canvas");
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      n++;
      c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#1B2A2F"; c.textBaseline = "alphabetic";
      c.font = `600 ${px(9)}px ${F}`;
      c.fillText(`${nm(root)} को वंशावली शाखा`, M, M + px(9));
      c.fillStyle = "#5C6C70"; c.font = `${px(4.6)}px ${F}`;
      c.fillText(`तल्लो पुस्ताबाट माथि ${info.levels} पुस्ता · ${info.shown} जना · हाम्रो वंशावली · ${date}`, M, M + px(17));
      if (total > 1) {
        c.textAlign = "right";
        c.fillText(`पृष्ठ ${n} / ${total}  (पङ्क्ति ${r + 1}, स्तम्भ ${k + 1})`, W - M, M + px(9));
        c.textAlign = "left";
      }
      c.save();
      c.beginPath(); c.rect(M, M + HEAD, aw, ah); c.clip();
      c.imageSmoothingQuality = "high";
      if (total === 1) c.drawImage(img, M + (aw - dw) / 2, M + HEAD + (ah - dh) / 2, dw, dh);
      else c.drawImage(img, M - k * aw, M + HEAD - r * ah, dw, dh);
      c.restore();
      if (n > 1) pdf.addPage("a3", "landscape");
      pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, A3.w, A3.h);
    }
  }
  return { blob: pdf.output("blob"), info: { ...info, pages: total } };
}
