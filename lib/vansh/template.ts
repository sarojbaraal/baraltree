// Excel template: download pre-filled with the people the viewer may see, fill new rows, upload as add-requests.
// Excel's own protection and dropdowns are only guidance — every row is re-validated here and again at admin approval.
import type { VPerson } from "./types";
import type { Graph } from "./graph";
import { DATE_RE, fbOk, yr } from "./text";
import { stamp } from "./exporters";

export const SHEET = "वंशावली";
const LISTS = "Lists";
export const MAX_NEW_ROWS = 300;
const BLANK_ROWS = 300;

const COLS = [
  "नाम", "लिङ्ग", "हजुरबुबा", "बुबा", "आमा", "जन्म मिति", "जन्म स्थान", "ठेगाना", "शिक्षा", "पेशा",
  "वैवाहिक अवस्था", "विवाह मिति", "पति/पत्नी", "सम्पर्क नम्बर", "अवस्था", "मृत्यु मिति", "मृत्यु स्थान",
  "email", "facebook link", "टिप्पणी", "id (नछुने)",
] as const;
const C = Object.fromEntries(COLS.map((c, i) => [c, i + 1])) as Record<(typeof COLS)[number], number>;
const WIDTH: Partial<Record<(typeof COLS)[number], number>> = { नाम: 24, हजुरबुबा: 22, बुबा: 34, आमा: 34, ठेगाना: 26, "पति/पत्नी": 24, "facebook link": 28, टिप्पणी: 30, "id (नछुने)": 10 };
const GENDER = ["पुरुष", "महिला", "अन्य"];
const MARITAL = ["अविवाहित", "विवाहित"];
const STATE = ["जीवित", "दिवंगत"];

export interface TemplateCtx {
  can: (id: string) => boolean;
  isStaff: boolean;
  myPosId: string | null;
}

/** Unique, stable label per person used in the dropdowns: name (birth year) — बुबा: X. */
export function personLabels(g: Graph, ctx: Pick<TemplateCtx, "can">): { label: Record<string, string>; byLabel: Record<string, string> } {
  const label: Record<string, string> = {};
  const byLabel: Record<string, string> = {};
  const list = g.people.filter((p) => ctx.can(p.id) && !p.name_only).sort((a, b) => a.name.localeCompare(b.name, "ne") || a.id.localeCompare(b.id));
  for (const p of list) {
    const f = p.father_id ? g.byId[p.father_id] : null;
    let l = `${p.name} (${yr(p.birth_bs) || "?"})${f ? " — बुबा: " + f.name : ""}`;
    if (byLabel[l]) {
      let n = 2;
      while (byLabel[`${l} #${n}`]) n++;
      l = `${l} #${n}`;
    }
    label[p.id] = l;
    byLabel[l] = p.id;
  }
  return { label, byLabel };
}

const GNE: Record<string, string> = { M: "पुरुष", F: "महिला", O: "अन्य" };

export async function buildTemplate(g: Graph, ctx: TemplateCtx): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "हाम्रो वंशावली";
  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  const help = wb.addWorksheet("निर्देश");
  const ls = wb.addWorksheet(LISTS, { state: "hidden" });

  const { label } = personLabels(g, ctx);
  const people = g.people.filter((p) => ctx.can(p.id) && !p.name_only).sort(g.byBirth);
  const ordered = Object.keys(label).sort((a, b) => label[a].localeCompare(label[b], "ne"));

  // Lists sheet: A label, B id, C grandfather (paternal), F male labels, G female labels
  ls.getRow(1).values = ["label", "id", "grandfather", "", "", "male", "female"];
  ordered.forEach((id, i) => {
    const p = g.byId[id];
    const gf = p.father_id ? g.byId[p.father_id]?.father_id : null;
    const r = ls.getRow(i + 2);
    r.getCell(1).value = label[id];
    r.getCell(2).value = id;
    r.getCell(3).value = gf && ctx.can(gf) ? g.byId[gf]?.name || "" : "";
  });
  const males = ordered.filter((id) => g.byId[id].gender === "M" || !g.byId[id].gender);
  const females = ordered.filter((id) => g.byId[id].gender === "F" || !g.byId[id].gender);
  males.forEach((id, i) => (ls.getRow(i + 2).getCell(6).value = label[id]));
  females.forEach((id, i) => (ls.getRow(i + 2).getCell(7).value = label[id]));

  // header
  ws.columns = COLS.map((c) => ({ header: c, width: WIDTH[c] ?? 16 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F78" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 24;

  // existing people: read-only reference rows
  const textCols = [C["जन्म मिति"], C["विवाह मिति"], C["सम्पर्क नम्बर"], C["मृत्यु मिति"]];
  const nameOf = (id?: string | null) => (id && g.byId[id] && ctx.can(id) ? g.byId[id].name : "");
  let r = 2;
  for (const p of people) {
    const private_ = ctx.isStaff || p.id === ctx.myPosId;
    const f = p.father_id ? g.byId[p.father_id] : null;
    const row = ws.getRow(r++);
    const vals: Record<string, string> = {
      नाम: p.name, लिङ्ग: GNE[p.gender || ""] || "", हजुरबुबा: f ? nameOf(f.father_id) : "", बुबा: nameOf(p.father_id), आमा: nameOf(p.mother_id),
      "जन्म मिति": p.birth_bs || "", "जन्म स्थान": p.birth_place || "", ठेगाना: p.address || "", शिक्षा: p.education || "", पेशा: p.occupation || "",
      "वैवाहिक अवस्था": g.isMarriedP(p) ? "विवाहित" : "अविवाहित", "विवाह मिति": p.marriage_bs || "",
      "पति/पत्नी": g.spousesOf(p).map(nameOf).filter(Boolean).join("; "), "सम्पर्क नम्बर": private_ ? p.phone || "" : "",
      अवस्था: p.is_living ? "जीवित" : "दिवंगत", "मृत्यु मिति": p.death_bs || "", "मृत्यु स्थान": p.death_place || "",
      email: private_ ? p.email || "" : "", "facebook link": p.facebook || "", टिप्पणी: p.notes || "", "id (नछुने)": p.id,
    };
    COLS.forEach((c) => {
      const cell = row.getCell(C[c]);
      cell.value = vals[c] ?? "";
      if (textCols.includes(C[c])) cell.numFmt = "@";
      cell.font = { color: { argb: "FF5C6C70" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F4F4" } };
      cell.protection = { locked: true };
    });
  }
  const firstNew = r;
  const lastNew = r + BLANK_ROWS - 1;
  const lastMale = Math.max(2, males.length + 1);
  const lastFemale = Math.max(2, females.length + 1);
  for (; r <= lastNew; r++) {
    const row = ws.getRow(r);
    COLS.forEach((c) => {
      const cell = row.getCell(C[c]);
      cell.protection = { locked: c === "हजुरबुबा" || c === "email" || c === "id (नछुने)" };
      if (textCols.includes(C[c])) cell.numFmt = "@";
      if (c === "email") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7E7" } };
    });
    const fcol = String.fromCharCode(64 + C["बुबा"]);
    row.getCell(C["हजुरबुबा"]).value = { formula: `IFERROR(VLOOKUP(${fcol}${r},${LISTS}!$A:$C,3,FALSE),"")` };
    const list = (col: number, items: string[]) => (ws.getCell(r, col).dataValidation = { type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`], showErrorMessage: true, errorTitle: "गलत छनोट", error: "सूचीबाट छान्नुहोस्।" });
    list(C["लिङ्ग"], GENDER);
    list(C["वैवाहिक अवस्था"], MARITAL);
    list(C["अवस्था"], STATE);
    if (males.length) ws.getCell(r, C["बुबा"]).dataValidation = { type: "list", allowBlank: true, formulae: [`${LISTS}!$F$2:$F$${lastMale}`], showErrorMessage: true, errorTitle: "बुबा", error: "सूचीबाट छान्नुहोस्। नभए खाली राखेर टिप्पणीमा लेख्नुहोस्।" };
    if (females.length) ws.getCell(r, C["आमा"]).dataValidation = { type: "list", allowBlank: true, formulae: [`${LISTS}!$G$2:$G$${lastFemale}`], showErrorMessage: true, errorTitle: "आमा", error: "सूचीबाट छान्नुहोस्।" };
    for (const dc of [C["जन्म मिति"], C["विवाह मिति"], C["मृत्यु मिति"]]) {
      const L = String.fromCharCode(64 + dc);
      ws.getCell(r, dc).dataValidation = {
        type: "custom", allowBlank: true,
        formulae: [`OR(${L}${r}="",AND(LEN(${L}${r})=10,MID(${L}${r},5,1)="-",MID(${L}${r},8,1)="-"))`],
        showErrorMessage: true, errorTitle: "मिति", error: "वि.सं. मिति YYYY-MM-DD (जस्तै 2045-05-12; थाहा नभए 2045-00-00)।",
      };
    }
  }
  ws.getColumn(C["id (नछुने)"]).hidden = true;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, autoFilter: true, sort: false });

  help.getColumn(1).width = 120;
  [
    "हाम्रो वंशावली — टेम्प्लेट",
    "१. खैरो रङका माथिका पङ्क्ति तपाईंले हेर्न पाउने अहिलेका व्यक्ति हुन् — यी हेर्न मात्र हो (अहिले सच्याउन मिल्दैन)।",
    "२. नयाँ व्यक्ति थप्न सेतो खाली पङ्क्तिमा लेख्नुहोस्। नाम अनिवार्य छ।",
    "३. बुबा र आमा सूचीबाट छान्नुहोस् (नाम, जन्म साल र बुबाको नाम देखिन्छ)। हजुरबुबा आफैँ भरिन्छ।",
    "४. मिति वि.सं.मा YYYY-MM-DD ढाँचामा (थाहा नभए महिना/गते ०० राख्न मिल्छ, जस्तै 2045-00-00)।",
    "५. पति/पत्नी: नाम लेख्नुहोस्। एकभन्दा बढी भए ; ले छुट्याउनुहोस्। वैवाहिक अवस्था 'अविवाहित' भए यो खाली हुनुपर्छ। छोराछोरी, पति/पत्नी वा विवाह-चिन्ह भएकालाई 'विवाहित' मानिन्छ।",
    "६. 'id (नछुने)' स्तम्भ लुकेको छ — नछुनुहोस्, नमेट्नुहोस्।",
    "७. फाइल अपलोड गर्दा सीधै थपिँदैन: एडमिन बाहेकका सबैको लागि परिवर्तन-अनुरोध बन्छ र एडमिनले स्वीकृत गरेपछि मात्र लागू हुन्छ।",
    "८. Excel को सुरक्षा र सूची केवल मार्गदर्शन हो; अपलोडमा सबै कुरा फेरि जाँचिन्छ।",
    "९. email र (अरूको) फोन देखाइँदैन/आयात हुँदैन।",
  ].forEach((t, i) => {
    const c = help.getRow(i + 1).getCell(1);
    c.value = t;
    c.alignment = { wrapText: true };
    if (i === 0) c.font = { bold: true, size: 14 };
  });
  void firstNew;
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export const templateName = () => `vanshavali-template-${stamp()}.xlsx`;

// ---------------------------------------------------------------- upload

export interface NewPersonDraft {
  row: number;
  payload: Record<string, unknown>;
  /** one-line summary for the preview */
  brief: string;
}
export interface TemplateParse {
  drafts: NewPersonDraft[];
  errors: { row: number; msg: string }[];
  /** existing (locked) rows whose visible values were changed — not applied in this phase */
  editedExisting: number;
}

type Cellv = unknown;
const txt = (v: Cellv): string => {
  if (v == null) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim();
    if ("result" in o) return txt(o.result);
    if (o.text != null) return txt(o.text);
    if (o.hyperlink) return o.hyperlink;
    return "";
  }
  return String(v).trim();
};

export async function parseTemplate(file: File, g: Graph, ctx: TemplateCtx): Promise<TemplateParse> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`'${SHEET}' शीट भेटिएन — साइटबाट डाउनलोड गरेको टेम्प्लेट प्रयोग गर्नुहोस्।`);
  const hdr = COLS.map((_, i) => txt(ws.getRow(1).getCell(i + 1).value));
  if (hdr[C["नाम"] - 1] !== "नाम" || hdr[C["बुबा"] - 1] !== "बुबा" || hdr[COLS.length - 1] !== COLS[COLS.length - 1])
    throw new Error("शीर्षक पङ्क्ति फेरिएको छ — टेम्प्लेटको पहिलो पङ्क्ति नबदल्नुहोस्।");

  const { byLabel } = personLabels(g, ctx);
  const drafts: NewPersonDraft[] = [];
  const errors: { row: number; msg: string }[] = [];
  let editedExisting = 0;
  const gmap: Record<string, string> = { पुरुष: "M", महिला: "F", अन्य: "O" };
  const seenNew = new Set<string>();

  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const v = (c: (typeof COLS)[number]) => txt(row.getCell(C[c]).value);
    const id = v("id (नछुने)");
    if (id) {
      const p = g.byId[id];
      if (p && ctx.can(id) && p.name !== v("नाम")) editedExisting++;
      return;
    }
    const name = v("नाम");
    const others = COLS.filter((c) => c !== "नाम" && c !== "हजुरबुबा" && c !== "id (नछुने)" && c !== "email").some((c) => v(c));
    if (!name) {
      if (others) errors.push({ row: n, msg: "नाम खाली छ" });
      return;
    }
    const err = (m: string) => errors.push({ row: n, msg: `${name}: ${m}` });
    if (drafts.length + errors.length >= MAX_NEW_ROWS) return;

    const payload: Record<string, unknown> = { name: name.replace(/\s+/g, " ") };
    let bad = false;
    const gl = v("लिङ्ग");
    if (gl) {
      if (!gmap[gl]) { err(`लिङ्ग "${gl}" मान्य छैन`); bad = true; } else payload.gender = gmap[gl];
    }
    for (const [col, key, want] of [["बुबा", "father_id", "M"], ["आमा", "mother_id", "F"]] as const) {
      const l = v(col);
      if (!l) continue;
      const pid = byLabel[l];
      if (!pid) { err(`${col} "${l}" सूचीमा छैन — सूचीबाट छान्नुहोस्`); bad = true; continue; }
      const q = g.byId[pid];
      if (q.gender && q.gender !== want) { err(`${col} को लिङ्ग मिलेन`); bad = true; continue; }
      payload[key] = pid;
    }
    for (const [col, key] of [["जन्म मिति", "birth_bs"], ["विवाह मिति", "marriage_bs"], ["मृत्यु मिति", "death_bs"]] as const) {
      const d = v(col);
      if (!d) continue;
      if (!DATE_RE.test(d)) { err(`${col} "${d}" YYYY-MM-DD हुनुपर्छ`); bad = true; } else payload[key] = d;
    }
    const state = v("अवस्था");
    const dead = state === "दिवंगत" || (!state && !!payload.death_bs);
    payload.is_living = !dead;
    if (!dead && (payload.death_bs || v("मृत्यु स्थान"))) { err("जीवित व्यक्तिको मृत्यु विवरण राखिएको छ"); bad = true; }
    const marital = v("वैवाहिक अवस्था");
    const sp = v("पति/पत्नी");
    if (marital === "अविवाहित" && sp) { err("अविवाहित भनेर पति/पत्नी लेखिएको छ"); bad = true; }
    if (sp) payload.spouse_name = sp.split(/\s*[;|；]\s*/)[0];
    const fb = v("facebook link");
    if (fb && !fbOk(fb)) { err("Facebook लिंक https://facebook.com/… जस्तो हुनुपर्छ"); bad = true; } else if (fb) payload.facebook = fb;
    const phone = v("सम्पर्क नम्बर");
    if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) { err("फोन नम्बर मिलेन"); bad = true; } else if (phone) payload.phone = phone;
    for (const [col, key] of [["जन्म स्थान", "birth_place"], ["ठेगाना", "address"], ["शिक्षा", "education"], ["पेशा", "occupation"], ["मृत्यु स्थान", "death_place"], ["टिप्पणी", "notes"]] as const) {
      const x = v(col);
      if (x.length > 500) { err(`${col} धेरै लामो छ`); bad = true; } else if (x) payload[key] = x;
    }
    const dup = `${name}|${payload.birth_bs || ""}|${payload.father_id || ""}`;
    if (seenNew.has(dup)) { err("यही व्यक्ति फाइलमा दोहोरिएको छ"); bad = true; }
    seenNew.add(dup);
    const exists = g.people.some((p) => ctx.can(p.id) && p.name === name && (p.birth_bs || "") === String(payload.birth_bs || "") && (p.father_id || "") === String(payload.father_id || ""));
    if (exists) { err("यही नाम, जन्म मिति र बुबा भएको व्यक्ति पहिले नै छ"); bad = true; }
    if (bad) return;
    const f = payload.father_id ? g.byId[String(payload.father_id)] : null;
    const m = payload.mother_id ? g.byId[String(payload.mother_id)] : null;
    drafts.push({ row: n, payload, brief: [f && "बुबा: " + f.name, m && "आमा: " + m.name, payload.spouse_name && "पति/पत्नी: " + payload.spouse_name, payload.birth_bs].filter(Boolean).join(" · ") || "—" });
  });
  if (drafts.length + errors.length > MAX_NEW_ROWS) errors.push({ row: 0, msg: `एकपटकमा अधिकतम ${MAX_NEW_ROWS} नयाँ व्यक्ति — बाँकी अर्को फाइलमा` });
  return { drafts, errors, editedExisting };
}
