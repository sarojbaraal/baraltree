// Data behind the main download window: role-limited Excel rows and the "me ± 2 generations" photo subset.
import type { VPerson } from "./types";
import { createGraph, type Graph } from "./graph";
import { loadXLSX, stamp } from "./exporters";

export const MAIN_COLS = [
  "नाम", "हजुरबुबा", "बुबा", "आमा", "जन्म मिति", "जन्म स्थान", "ठेगाना", "शिक्षा", "पेशा",
  "वैवाहिक अवस्था", "पति/पत्नी", "सम्पर्क नम्बर", "email address", "facebook link", "टिप्पणी",
] as const;

export interface MainCtx {
  can: (id: string) => boolean;
  /** admin / moderator */
  isStaff: boolean;
  /** the signed-in member's own person row */
  myPosId: string | null;
}

/** Rows the viewer may see. Phone/email only for staff and the viewer's own row. */
export function mainRows(g: Graph, ctx: MainCtx): string[][] {
  const nameOf = (id?: string | null) => (id && g.byId[id] ? g.byId[id].name : "");
  return g.people
    .filter((p) => ctx.can(p.id) && !p.name_only)
    .sort(g.byBirth)
    .map((p) => {
      const sp = g.spousesOf(p);
      const private_ = ctx.isStaff || p.id === ctx.myPosId;
      const married = sp.length > 0 || !!p.marriage_bs;
      const f = p.father_id ? g.byId[p.father_id] : null;
      return [
        p.name,
        f ? nameOf(f.father_id) : "",
        nameOf(p.father_id),
        nameOf(p.mother_id),
        p.birth_bs || "",
        p.birth_place || "",
        p.address || "",
        p.education || "",
        p.occupation || "",
        married ? "विवाहित" : p.is_living ? "अविवाहित" : "",
        sp.map((id) => (ctx.can(id) ? nameOf(id) : "")).filter(Boolean).join("; "),
        private_ ? p.phone || "" : "",
        private_ ? p.email || "" : "",
        p.facebook || "",
        p.notes || "",
      ];
    });
}

export async function exportMainXLSX(g: Graph, ctx: MainCtx) {
  const XLSX = await loadXLSX();
  const rows = mainRows(g, ctx);
  const ws = XLSX.utils.aoa_to_sheet([[...MAIN_COLS], ...rows]);
  const textCols = [4, 11]; // date and phone stay text
  for (let r = 1; r <= rows.length; r++)
    for (const c of textCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) { cell.t = "s"; cell.z = "@"; }
    }
  ws["!cols"] = MAIN_COLS.map((k) => ({ wch: k === "टिप्पणी" || k === "ठेगाना" || k === "facebook link" ? 30 : 18 }));
  ws["!freeze"] = { xSplit: 1, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "वंशावली");
  XLSX.writeFile(wb, `vanshavali-${stamp()}.xlsx`);
  return rows.length;
}

/** Me, my direct ancestors up to `up` generations, my descendants down to `down`, and their spouses. */
export function nearSubset(g: Graph, myId: string, up = 2, down = 2): VPerson[] {
  const keep = new Set<string>([myId]);
  const climb = (id: string, n: number) => {
    if (n === 0) return;
    const p = g.byId[id];
    for (const pid of [p.father_id, p.mother_id]) if (pid && g.byId[pid]) { keep.add(pid); climb(pid, n - 1); }
  };
  const fall = (id: string, n: number) => {
    if (n === 0) return;
    for (const k of g.kidsOf(g.byId[id])) { keep.add(k.id); fall(k.id, n - 1); }
  };
  climb(myId, up);
  fall(myId, down);
  for (const id of [...keep]) for (const s of g.spousesOf(g.byId[id])) keep.add(s);
  const people = [...keep].map((id) => g.byId[id]).map((p) => ({
    ...p,
    father_id: p.father_id && keep.has(p.father_id) ? p.father_id : null,
    mother_id: p.mother_id && keep.has(p.mother_id) ? p.mother_id : null,
  }));
  return people;
}
export const nearGraph = (g: Graph, myId: string) => createGraph(nearSubset(g, myId));
