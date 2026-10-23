import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";
import { branchSubset, cascadeRows } from "./branchPrint";
import type { VPerson } from "./types";

const P = (id: string, father?: string, extra: Partial<VPerson> = {}) =>
  ({ id, name: id, gender: "M", father_id: father ?? null, mother_id: null, is_living: true, created_at: id, ...extra }) as VPerson;

describe("branchSubset", () => {
  // a0 -> a1 -> ... -> a9 (10 generations) plus a side child b3 of a2 and a wife w9 of a9
  const chain = Array.from({ length: 10 }, (_, i) => P("a" + i, i ? "a" + (i - 1) : undefined));
  const people = [...chain, P("b3", "a2"), P("w9", undefined, { gender: "F", spouse_id: "a9" })];
  people.find((p) => p.id === "a9")!.spouse_id = "w9";
  const g = createGraph(people);

  it("keeps the deepest generation and 6 above it", () => {
    const r = branchSubset(g, "a0");
    expect(r.maxDepth).toBe(9);
    expect(r.from).toBe(3);
    expect(r.levels).toBe(7);
    const ids = r.people.map((p) => p.id).sort();
    expect(ids).toEqual(["a3", "a4", "a5", "a6", "a7", "a8", "a9", "b3", "w9"]);
  });
  it("cascades depth-first, spouse on the same row", () => {
    const rows = cascadeRows(g, "a0");
    expect(rows.map((r) => r.p.id)).toEqual(["a3", "a4", "a5", "a6", "a7", "a8", "a9", "b3"]);
    expect(rows.map((r) => r.lvl)).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
    expect(rows[1].parent).toBe(0);
    expect(rows[6].spouses.map((x) => x.id)).toEqual(["w9"]);
    expect(rows[7].parent).toBeNull();
  });
  it("short branch prints everything", () => {
    const r = branchSubset(g, "a7");
    expect(r.from).toBe(0);
    expect(r.levels).toBe(3);
  });
});
