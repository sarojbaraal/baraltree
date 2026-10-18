// Import: converts spreadsheet/JSON rows into import_people payloads and a before/after preview.
// Ported from the original app.js (importRows / previewImport).
import type { VPerson } from "./types";
import type { Graph } from "./graph";
import { LABEL } from "./text";
import { loadXLSX } from "./exporters";

export interface ImportRow {
  id: string;
  name: string;
  gender: string;
  father_id: string;
  mother_id: string;
  spouse_id: string;
  more_spouse_ids: string[];
  is_living: boolean;
  birth_bs: string;
  death_bs: string;
  phone: string;
  address: string;
  notes: string;
}

const GMAP: Record<string, string> = {
  m: "M", male: "M", "पुरुष": "M", "छोरा": "M",
  f: "F", female: "F", "महिला": "F", "छोरी": "F",
  o: "O", "अन्य": "O",
};
const NO = ["false", "0", "no", "n", "होइन", "मृत", "dead"];
const UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ParsedImport {
  rows: ImportRow[];
  /** Number of cells Excel had converted to real dates (they may be wrong). */
  dateWarn: number;
}

/** Turns raw spreadsheet rows into validated import rows. Throws Error(message) for bad input. */
export function parseImportRows(g: Graph, raw: Record<string, unknown>[]): ParsedImport {
  let dateWarn = 0;
  const cell = (v: unknown): string => {
    if (v instanceof Date) {
      dateWarn++;
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
    }
    return String(v ?? "").trim();
  };
  type Row = Record<string, unknown> & { _row: number; _id: string };
  const rows = (raw || [])
    .map((r) => {
      const o: Record<string, unknown> = {};
      Object.keys(r).forEach((k) => (o[k.trim().toLowerCase()] = r[k]));
      return o;
    })
    .filter((o) => Object.values(o).some((v) => cell(v))) as Row[];
  if (!rows.length) throw new Error("फाइलमा कुनै पङ्क्ति भेटिएन");
  rows.forEach((o, i) => {
    o._row = i + 2;
    o._id = cell(o.id) || "new" + (i + 1);
    if (!cell(o.name)) throw new Error(`पङ्क्ति ${o._row}: नाम खाली छ`);
  });
  const ids = new Set(rows.map((o) => o._id));
  if (ids.size !== rows.length) throw new Error("id दोहोरिएको छ");
  const cand: Record<string, string[]> = {};
  rows.forEach((o) => (cand[cell(o.name)] ||= []).push(o._id));
  g.people.filter((p) => !ids.has(p.id)).forEach((p) => (cand[p.name] ||= []).push(p.id));
  const ref = (v: unknown, o: Row, what: string): string => {
    const s = cell(v);
    if (!s) return "";
    if (ids.has(s) || UUIDRE.test(s)) return s;
    const m = cand[s];
    if (!m) throw new Error(`पङ्क्ति ${o._row}: ${what} "${s}" भेटिएन`);
    if (m.length > 1) throw new Error(`पङ्क्ति ${o._row}: ${what} "${s}" नाम दोहोरिएको छ — नामको सट्टा id लेख्नुहोस्`);
    return m[0];
  };
  const out: ImportRow[] = rows.map((o) => {
    const sps = [
      ...cell(o.spouse || o.spouse_id).split(/\s*[;|；]\s*/),
      ...(Array.isArray(o.more_spouse_ids) ? (o.more_spouse_ids as unknown[]).map(String) : []),
    ]
      .filter(Boolean)
      .map((s) => ref(s, o, "पति/पत्नी"));
    const gv = cell(o.gender);
    return {
      id: o._id,
      name: cell(o.name),
      gender: GMAP[gv.toLowerCase()] || (["M", "F", "O"].includes(gv) ? gv : ""),
      father_id: ref(o.father || o.father_id, o, "बुबा"),
      mother_id: ref(o.mother || o.mother_id, o, "आमा"),
      spouse_id: sps[0] || "",
      more_spouse_ids: sps.slice(1),
      is_living: !NO.includes(cell(o.is_living).toLowerCase()),
      birth_bs: cell(o.birth_bs),
      death_bs: cell(o.death_bs),
      phone: cell(o.phone),
      address: cell(o.address),
      notes: cell(o.notes),
    };
  });
  return { rows: out, dateWarn };
}

/** Reads a .json/.csv/.xlsx/.xls file into raw rows. */
export async function readImportFile(f: File): Promise<Record<string, unknown>[]> {
  const n = f.name.toLowerCase();
  if (n.endsWith(".json")) {
    const raw = JSON.parse(await f.text());
    return Array.isArray(raw) ? raw : raw.people;
  }
  const XLSX = await loadXLSX();
  const csv = n.endsWith(".csv");
  const wb = XLSX.read(csv ? (await f.text()).replace(/^﻿/, "") : await f.arrayBuffer(), {
    type: csv ? "string" : "array",
    cellDates: !csv,
    raw: csv,
  });
  return XLSX.utils.sheet_to_json(wb.Sheets["वंशावली"] || wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
}

export interface ImportDiff {
  add: Record<string, string>[];
  chg: { n: string; ch: { k: string; a: string; b: string }[] }[];
  same: number;
  cleared: number;
}
export const IMPORT_LABELS: Record<string, string> = { ...LABEL, father: "बुबा", mother: "आमा", spouse: "पति/पत्नी" };
const KEYS = ["name", "gender", "father", "mother", "spouse", "is_living", "birth_bs", "death_bs", "phone", "address", "notes"];
const G_NE: Record<string, string> = { M: "पुरुष", F: "महिला", O: "अन्य" };

export function diffImport(g: Graph, out: ImportRow[]): ImportDiff {
  const { byId, spousesOf } = g;
  const nameOf = (id?: string | null) => (id ? byId[id]?.name || out.find((o) => o.id === id)?.name || "?" : "");
  const viewImp = (o: ImportRow) => ({
    name: o.name || "",
    gender: G_NE[o.gender] || "",
    father: nameOf(o.father_id),
    mother: nameOf(o.mother_id),
    spouse: [o.spouse_id, ...(o.more_spouse_ids || [])].filter(Boolean).map(nameOf).join("; "),
    is_living: o.is_living === false ? "होइन" : "हो",
    birth_bs: o.birth_bs || "",
    death_bs: o.death_bs || "",
    phone: o.phone || "",
    address: o.address || "",
    notes: o.notes || "",
  });
  const viewOld = (p: VPerson) => ({
    name: p.name || "",
    gender: G_NE[p.gender || ""] || "",
    father: nameOf(p.father_id),
    mother: nameOf(p.mother_id),
    spouse: spousesOf(p).map(nameOf).join("; "),
    is_living: p.is_living === false ? "होइन" : "हो",
    birth_bs: p.birth_bs || "",
    death_bs: p.death_bs || "",
    phone: p.phone || "",
    address: p.address || "",
    notes: p.notes || "",
  });
  const add: Record<string, string>[] = [];
  const chg: ImportDiff["chg"] = [];
  let same = 0;
  let cleared = 0;
  out.forEach((o) => {
    const p = byId[o.id];
    const nv = viewImp(o) as Record<string, string>;
    if (!p) {
      add.push(nv);
      return;
    }
    const ov = viewOld(p) as Record<string, string>;
    const ch = KEYS.filter((k) => ov[k] !== nv[k]).map((k) => ({ k, a: ov[k], b: nv[k] }));
    if (!ch.length) {
      same++;
      return;
    }
    cleared += ch.filter((c) => c.a && !c.b).length;
    chg.push({ n: ov.name, ch });
  });
  return { add, chg, same, cleared };
}
