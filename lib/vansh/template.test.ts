import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createGraph } from "./graph";
import { SHEET, buildTemplate, parseTemplate, personLabels } from "./template";
import type { VPerson } from "./types";

const P = (id: string, o: Partial<VPerson> = {}) =>
  ({ id, name: id, gender: "M", father_id: null, mother_id: null, spouse_id: null, is_living: true, created_at: id, ...o }) as VPerson;
const people = [
  P("gf", { name: "हजुर", birth_bs: "1980-01-01" }),
  P("f", { name: "बुबा", father_id: "gf", spouse_id: "m", birth_bs: "2010-01-01" }),
  P("m", { name: "आमा", gender: "F", spouse_id: "f" }),
  P("hidden", { name: "गोप्यव्यक्ति" }),
];
const g = createGraph(people);
const ctx = { can: (id: string) => id !== "hidden", isStaff: false, myPosId: "f" };

async function filled(rows: Record<number, string>[]) {
  const blob = await buildTemplate(g, ctx);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const ws = wb.getWorksheet(SHEET)!;
  const first = ws.rowCount + 1; // after pre-filled + blank rows? find first row with empty id and empty name
  let r = 2;
  while (ws.getRow(r).getCell(21).value) r++;
  void first;
  rows.forEach((vals, i) => Object.entries(vals).forEach(([c, v]) => (ws.getRow(r + i).getCell(+c).value = v)));
  const out = await wb.xlsx.writeBuffer();
  return new File([out], "t.xlsx");
}

describe("template", () => {
  it("only offers accessible people in lists", () => {
    const { byLabel } = personLabels(g, ctx);
    expect(Object.values(byLabel)).not.toContain("hidden");
    expect(Object.keys(byLabel).some((l) => l.includes("बुबा (2010) — बुबा: हजुर"))).toBe(true);
  });
  it("parses a new row with parents chosen from the list", async () => {
    const { label } = personLabels(g, ctx);
    const f = await filled([{ 1: "नयाँ", 2: "पुरुष", 4: label["f"], 5: label["m"], 6: "2070-05-12", 11: "अविवाहित" }]);
    const r = await parseTemplate(f, g, ctx);
    expect(r.errors).toEqual([]);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].payload).toMatchObject({ name: "नयाँ", gender: "M", father_id: "f", mother_id: "m", birth_bs: "2070-05-12", is_living: true });
  });
  it("rejects bad dates, unknown parents, wrong gender parent, spouse for unmarried", async () => {
    const { label } = personLabels(g, ctx);
    const f = await filled([
      { 1: "क", 6: "2070/05/12" },
      { 1: "ख", 4: "कुनै बुबा" },
      { 1: "ग", 4: label["m"] },
      { 1: "घ", 11: "अविवाहित", 13: "कोही" },
    ]);
    const r = await parseTemplate(f, g, ctx);
    expect(r.drafts).toHaveLength(0);
    expect(r.errors).toHaveLength(4);
  });
  it("does not leak hidden people names into the sheet", async () => {
    const blob = await buildTemplate(g, ctx);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    let found = false;
    wb.eachSheet((s) => s.eachRow((row) => row.eachCell((c) => { if (String(c.value).includes("गोप्यव्यक्ति")) { found = true; console.log(s.name, c.address, JSON.stringify(c.value)); } })));
    expect(found).toBe(false);
  });
});
