// "Poster" chart: the printable family chart. Cream paper, one coloured rounded card per person (colour = generation),
// photo or default male/female figure, a heart between spouses with the children's bracket hanging from it,
// a big title and a generation legend. Used for chart pages in PDF and for the JPG / SVG downloads.
import type { VPerson } from "./types";
import type { Layout } from "./layout";
import { symbol } from "./exporters";
import { BRAND, NOTICE, wrapChars, type Stamp } from "./notice";
import { np, yr } from "./text";

const F = 'font-family="Noto Sans Devanagari,sans-serif"';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const cut = (s: string, n = 13) => (Array.from(s).length > n ? Array.from(s).slice(0, n - 1).join("") + "…" : s);
const ORD = ["पहिलो", "दोस्रो", "तेस्रो", "चौथो", "पाँचौं", "छैटौं", "सातौं", "आठौं", "नवौं", "दसौं", "एघारौं", "बाह्रौं", "तेह्रौं", "चौधौं", "पन्ध्रौं"];
export const genName = (i: number) => `${ORD[i] ?? np(i + 1) + "औं"} पुस्ता`;

export interface PosterOpts {
  /** big title: normal part + bold part */
  title?: [string, string];
  /** printed generation 0 is really this generation number (0-based) */
  genOffset?: number;
  stamp?: Stamp;
  /** leave the top title band and the footer out (the PDF page already has its own) */
  bare?: boolean;
  /** small tag under a card, keyed by person id (e.g. "→ पृ. ५") */
  chips?: Record<string, string>;
  /** line above the tree on a continuation page */
  banner?: string;
}

export const POSTER_BG = "#FBF4EE";
const LINE = "#BBA999";
/** ten distinct generation colours (a legend entry per generation) */
export const PGEN = ["#E57A6B", "#2FB58A", "#6A5FE0", "#F06BA8", "#D9A62E", "#7DB83A", "#17B6C9", "#E8467C", "#EE6A24", "#B65AD6"];

function face(p: VPerson, i: number, cx: number, cy: number, r: number, col: string, can: (id: string) => boolean, photos: Record<string, string>) {
  const k = p.gender === "F" ? "F" : "M";
  const clip = `<clipPath id="pf${i}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="1.5"/>`;
  if (!can(p.id)) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#E9DFD6"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" ${F}>🔒</text>`;
  const img = photos[p.id] || ((p.gender === "M" || p.gender === "F") && photos["__" + k]);
  if (img) return clip + `<image href="${img}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pf${i})"/>` + ring;
  if (p.gender !== "M" && p.gender !== "F")
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#D9CFC6"/><circle cx="${cx}" cy="${cy - 4}" r="5.5" fill="#fff"/><path d="M${cx - 10} ${cy + 14} a10 9 0 0 1 20 0z" fill="#fff"/>`;
  const w = 2 * r, h = k === "F" ? w * 1.37 : w * 1.42;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#F1E8DF"/>${clip}<g clip-path="url(#pf${i})"><use href="#av${k}" x="${cx - r}" y="${cy - r}" width="${w}" height="${h}"/></g>` + ring;
}

export function posterSvg(layout: Layout, can: (id: string) => boolean, nm: (p: VPerson) => string, photos: Record<string, string> = {}, o: PosterOpts = {}): string {
  const { cards, lines, hearts, W, H, dims } = layout;
  const { cw, ch } = dims;
  const PAD = 36;
  const TOP = o.bare ? (o.banner ? 40 : 0) : 96;
  const off = o.genOffset ?? 0;
  const maxD = Math.max(0, ...cards.map((c) => c.d));
  const legCols = Math.max(1, Math.min(5, Math.floor((W + 2 * PAD) / 190)));
  const legRows = Math.ceil((maxD + 1) / legCols);
  const legH = 20 + legRows * 26;
  const noteLines = o.bare || !o.stamp ? [] : [...wrapChars(NOTICE, Math.max(40, Math.floor((W + 2 * PAD) / 6.6))), o.stamp.line];
  const footH = o.bare ? 0 : 20 + noteLines.length * 16;
  const TW = W + 2 * PAD;
  const TH = TOP + H + PAD + legH + footH + (o.bare ? 0 : 10);

  const lineSvg = lines.map((l) => `<path d="${l.d}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${l.m ? ' stroke-dasharray="5 5"' : ""}/>`).join("");
  const heartSvg = hearts
    .map((h) => `<path transform="translate(${h.x} ${h.y + 1})" d="M0 5.5C-9 -1 -5.5 -7 -2.4 -6.2C-1.1 -5.9 0 -4.8 0 -4.8C0 -4.8 1.1 -5.9 2.4 -6.2C5.5 -7 9 -1 0 5.5Z" fill="#B58F8F"/>`)
    .join("");
  const cardSvg = cards
    .map(({ p, x, y, d }, i) => {
      const col = PGEN[(d + off) % PGEN.length];
      const full = can(p.id) ? nm(p) : "";
      const parts = full.trim().split(/\s+/);
      const l1 = can(p.id) ? parts[0] || "" : "गोप्य";
      const l2 = parts.length > 1 ? parts.slice(1).join(" ") : "";
      const life = can(p.id) ? (yr(p.birth_bs) || "") + (p.is_living ? "" : " – " + (yr(p.death_bs) || "?")) : "";
      const tx = x + 52;
      const chip = o.chips?.[p.id];
      return (
        (chip ? `<rect x="${x + cw / 2 - 38}" y="${y + ch + 5}" width="76" height="19" rx="9.5" fill="${col}"/><text x="${x + cw / 2}" y="${y + ch + 19}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff" ${F}>${esc(chip)}</text>` : "") +
        `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="17" fill="#fff" stroke="${col}" stroke-width="2.6"/>` +
        face(p, i, x + 28, y + ch / 2, 17.5, col, can, photos) +
        `<text x="${tx}" y="${y + (life ? 23 : 28)}" font-size="14" font-weight="700" fill="#2B2420" ${F}>${esc(cut(l1))}</text>` +
        (l2 ? `<text x="${tx}" y="${y + (life ? 39 : 45)}" font-size="13.5" font-weight="500" fill="#4B413A" ${F}>${esc(cut(l2))}</text>` : "") +
        (life ? `<text x="${tx}" y="${y + 53}" font-size="10.5" fill="#8C7D72" ${F}>${esc(life)}</text>` : "")
      );
    })
    .join("");

  const legY = TOP + H + PAD * 0.5;
  const legend =
    `<g>` +
    Array.from({ length: maxD + 1 }, (_, g) => {
      const col = g % legCols, row = Math.floor(g / legCols);
      const lx = PAD + col * ((TW - 2 * PAD) / legCols), ly = legY + 18 + row * 26;
      return `<rect x="${lx}" y="${ly - 12}" width="14" height="14" rx="4" fill="${PGEN[(g + off) % PGEN.length]}"/><text x="${lx + 22}" y="${ly}" font-size="14" fill="#4B413A" ${F}>${genName(g + off)}</text>`;
    }).join("") +
    `</g>`;

  const banner = o.banner ? `<rect x="${PAD}" y="6" width="${Math.min(TW - 2 * PAD, 40 + Array.from(o.banner).length * 11)}" height="26" rx="13" fill="#E6F1F1"/><text x="${PAD + 14}" y="24" font-size="14" font-weight="600" fill="#1F6F78" ${F}>${esc(o.banner)}</text>` : "";
  const title = o.bare || !o.title ? "" : `<text x="${PAD}" y="62" font-size="40" fill="#2B2420" ${F}>${esc(o.title[0])}<tspan font-weight="800">${esc(o.title[1])}</tspan></text><text x="${PAD}" y="86" font-size="13" fill="#8C7D72" ${F}>${esc(BRAND)}</text>`;
  const fy = TOP + H + PAD + legH + 6;
  const foot = noteLines.length
    ? `<line x1="${PAD}" y1="${fy - 10}" x2="${TW - PAD}" y2="${fy - 10}" stroke="#E2D6CB"/>` +
      noteLines.map((t, i) => `<text x="${PAD}" y="${fy + 8 + i * 16}" font-size="11" fill="#7A6C62" ${F}>${esc(t)}</text>`).join("")
    : "";
  const meta = o.stamp ? `<metadata>${esc(BRAND + " | " + o.stamp.line + " | " + NOTICE)}</metadata>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}" viewBox="0 0 ${TW} ${TH}">${meta}` +
    `<defs>${symbol("avM")}${symbol("avF")}</defs><rect width="${TW}" height="${TH}" fill="${POSTER_BG}"/>${title}${banner}` +
    `<g transform="translate(${PAD} ${TOP})">${lineSvg}${heartSvg}${cardSvg}</g>` +
    `<g transform="translate(0 0)">${legend}</g>${foot}</svg>`
  );
}

/** Pixel size written in an SVG produced above. */
export function svgSize(svg: string) {
  const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/);
  return { w: m ? +m[1] : 1000, h: m ? +m[2] : 700 };
}
export const POSTER_PAD = 36;
