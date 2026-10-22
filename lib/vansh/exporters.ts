// Export helpers: JSON / CSV / XLSX / SVG / JPG (ported from the original app.js).
import type { VPerson } from "./types";
import type { Graph } from "./graph";
import { CW, CH, GEN, type Layout } from "./layout";
import { yr } from "./text";

export const PF = [
  "id", "name", "gender", "father_id", "mother_id", "spouse_id", "more_spouse_ids", "is_living", "birth_bs", "death_bs",
  "phone", "address", "notes", "maiden_name", "married_name", "birth_place", "email", "facebook", "death_place", "education", "occupation", "marriage_bs",
] as const;

export const SHEET_COLS = [
  "id", "name", "gender", "father", "mother", "spouse", "is_living", "birth_bs", "death_bs", "phone", "address", "notes",
  "death_place", "education", "occupation", "marriage_bs",
] as const;
export type SheetRow = Record<(typeof SHEET_COLS)[number], string>;

export const stamp = () => new Date().toISOString().slice(0, 10);

export function download(name: string, content: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

const csvq = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export function sheetRows(g: Graph): SheetRow[] {
  const { people, byId, spousesOf } = g;
  const nameRef = (id?: string | null) => {
    const q = id ? byId[id] : undefined;
    if (!q) return "";
    return people.filter((x) => x.name === q.name).length > 1 ? q.id : q.name;
  };
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    gender: p.gender || "",
    father: nameRef(p.father_id),
    mother: nameRef(p.mother_id),
    spouse: spousesOf(p).map(nameRef).join("; "),
    is_living: p.is_living ? "हो" : "होइन",
    birth_bs: p.birth_bs || "",
    death_bs: p.death_bs || "",
    phone: p.phone || "",
    address: p.address || "",
    notes: p.notes || "",
    death_place: p.death_place || "",
    education: p.education || "",
    occupation: p.occupation || "",
    marriage_bs: p.marriage_bs || "",
  }));
}

export function csvText(g: Graph): string {
  const rows = sheetRows(g);
  return (
    "﻿" +
    [SHEET_COLS as readonly string[], ...rows.map((r) => SHEET_COLS.map((k) => r[k]))]
      .map((r) => r.map(csvq).join(","))
      .join("\n")
  );
}
export const exportCSV = (g: Graph) => download(`vanshavali-${stamp()}.csv`, csvText(g), "text/csv;charset=utf-8");

export function jsonText(people: VPerson[]): string {
  return JSON.stringify(
    people.map((p) => Object.fromEntries(PF.map((k) => [k, (p as unknown as Record<string, unknown>)[k] ?? null]))),
    null,
    1
  );
}
export const exportJSON = (people: VPerson[]) => download(`vanshavali-${stamp()}.json`, jsonText(people), "application/json");

// ---- XLSX (loaded from the same CDN build the original app used) ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XLSXLib = any;
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let xlsxPromise: Promise<XLSXLib> | null = null;
export function loadXLSX(): Promise<XLSXLib> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = XLSX_URL;
      s.onload = () => res(w.XLSX);
      s.onerror = () => {
        xlsxPromise = null;
        rej(new Error("Excel library लोड भएन (इन्टरनेट जाँच्नुहोस्)।"));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

export async function exportXLSX(g: Graph) {
  const XLSX = await loadXLSX();
  const cols = SHEET_COLS as readonly string[];
  const ws = XLSX.utils.json_to_sheet(sheetRows(g), { header: cols });
  const rng = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 1; r <= rng.e.r; r++)
    ["birth_bs", "death_bs", "phone"].forEach((k) => {
      const c = ws[XLSX.utils.encode_cell({ r, c: cols.indexOf(k) })];
      if (c) {
        c.t = "s";
        c.z = "@";
      }
    });
  ws["!cols"] = cols.map((k) => ({ wch: k === "id" ? 14 : k === "notes" || k === "address" ? 28 : 16 }));
  const help = XLSX.utils.aoa_to_sheet([
    ["निर्देशन"],
    ["१. वंशावली शीटमा सम्पादन गर्नुहोस्। पहिलो पङ्क्ति (शीर्षक) नबदल्नुहोस्।"],
    ["२. id भएको पङ्क्तिको विवरण बदलिन्छ; id खाली पङ्क्ति नयाँ व्यक्ति हुन्छ। id नबदल्नुहोस्।"],
    ["३. father / mother / spouse मा नाम लेख्नुहोस्। एकभन्दा बढी पति/पत्नी भए ; ले छुट्याउनुहोस् (जस्तै: सीता; गीता)। पहिलो नाम मुख्य जोडी हो।"],
    ["४. एउटै नाम दोहोरिएको व्यक्तिलाई जोड्न नामको सट्टा उसको id लेख्नुहोस्।"],
    ["५. gender: M (पुरुष), F (महिला), O (अन्य)। is_living: हो / होइन।"],
    ["६. मिति BS मा, जस्तै 2045-05-12। कक्षको ढाँचा Text राख्नुहोस्, नत्र Excel ले मिति बदल्न सक्छ।"],
    ["७. फाइलमा नभएका व्यक्ति हटाइँदैनन्। हटाउन साइटबाट हटाउने अनुरोध गर्नुहोस्।"],
    ["८. आयात गर्नुअघि JSON ब्याकअप लिनुहोस्।"],
  ]);
  help["!cols"] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "वंशावली");
  XLSX.utils.book_append_sheet(wb, help, "निर्देश");
  XLSX.writeFile(wb, `vanshavali-${stamp()}.xlsx`);
}

// ---- chart image export ----
export function svgText(layout: Layout, can: (id: string) => boolean, nm: (p: VPerson) => string): string {
  const { lines, cards, W, H } = layout;
  const F = 'font-family="Noto Sans Devanagari,sans-serif"';
  const cut = (s: string) => xmlEsc(s.length > 20 ? s.slice(0, 19) + "…" : s);
  const body =
    lines
      .map((l) => `<path d="${l.d}" fill="none" stroke="#8A9A9C" stroke-width="1.5"${l.m ? ' stroke-dasharray="5 4"' : ""}/>`)
      .join("") +
    cards
      .map(({ p, x, y, d }) => {
        const fill = p.gender === "M" ? "#4A78A8" : p.gender === "F" ? "#C0587A" : "#7A8C8F";
        return (
          `<rect x="${x}" y="${y}" width="${CW}" height="${CH}" rx="10" fill="#fff" stroke="#C5D0CC"/>` +
          `<rect x="${x}" y="${y}" width="${CW}" height="5" rx="2" fill="${GEN[d % GEN.length]}"/>` +
          `<circle cx="${x + 30}" cy="${y + CH / 2 + 2}" r="19" fill="${fill}"/>` +
          `<text x="${x + 30}" y="${y + CH / 2 + 8}" text-anchor="middle" font-size="18" fill="#fff" ${F}>${xmlEsc(can(p.id) ? Array.from(p.name)[0] : "🔒")}</text>` +
          `<text x="${x + 58}" y="${y + CH / 2}" font-size="14" font-weight="600" fill="#1B2A2F" ${F}>${cut(nm(p))}</text>` +
          `<text x="${x + 58}" y="${y + CH / 2 + 18}" font-size="12" fill="#5C6C70" ${F}>${yr(p.birth_bs) || "?"}${p.is_living ? "" : " – " + (yr(p.death_bs) || "?")}</text>`
        );
      })
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${W + 40} ${H + 40}" width="${W + 40}" height="${H + 40}"><rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="#fff"/>${body}</svg>`;
}

export const exportSVG = (svg: string) => download(`vanshavali-${stamp()}.svg`, svg, "image/svg+xml");

export function exportJPG(svg: string, W: number, H: number): Promise<void> {
  const w = W + 40;
  const h = H + 40;
  const sc = Math.min(2, 8000 / Math.max(w, h));
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * sc);
      cv.height = Math.round(h * sc);
      const c = cv.getContext("2d");
      if (!c) return rej(new Error("canvas"));
      c.fillStyle = "#fff";
      c.fillRect(0, 0, cv.width, cv.height);
      c.scale(sc, sc);
      c.drawImage(img, 0, 0, w, h);
      cv.toBlob(
        (b) => {
          if (!b) return rej(new Error("blob"));
          download(`vanshavali-${stamp()}.jpg`, b, "image/jpeg");
          res();
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = () => rej(new Error("JPG बनाउन सकिएन; SVG प्रयोग गर्नुहोस् न ल।"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}
