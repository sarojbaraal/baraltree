import { describe, expect, it } from "vitest";
import { applyLocal, remapIds } from "./offline";
import type { NewRequest, VPerson } from "./types";

const P = (id: string, name: string, extra: Partial<VPerson> = {}): VPerson => ({ id, name, gender: "M", father_id: null, mother_id: null, spouse_id: null, is_living: true, created_at: "", ...extra });
const R = (action: NewRequest["action"], person_id: string | null, payload: Record<string, unknown>): NewRequest => ({ requested_by: "u", action, person_id, payload, note: null });

describe("applyLocal", () => {
  const base = [P("a", "आमा", { gender: "F" }), P("b", "बुबा")];
  it("adds a child with a new spouse placeholder", () => {
    const r = applyLocal(base, [R("add", null, { name: "छोरा", gender: "M", father_id: "b", mother_id: "a", spouse_name: "बुहारी" })]);
    expect(r.people).toHaveLength(4);
    const kid = r.people.find((p) => p.name === "छोरा")!;
    expect(kid.father_id).toBe("b");
    expect(r.people.find((p) => p.name === "बुहारी")!.spouse_id).toBe(kid.id);
    expect(r.created).toHaveLength(2);
    expect(base).toHaveLength(2); // input untouched
  });
  it("updates and deletes", () => {
    const u = applyLocal(base, [R("update", "b", { address: "काठमाडौं" })]);
    expect(u.people.find((p) => p.id === "b")!.address).toBe("काठमाडौं");
    const d = applyLocal([...base, P("c", "छोरी", { father_id: "b" })], [R("delete", "b", {})]);
    expect(d.people.map((p) => p.id)).toEqual(["a", "c"]);
    expect(d.people.find((p) => p.id === "c")!.father_id).toBeNull();
  });
});

describe("remapIds", () => {
  it("replaces local ids in later requests", () => {
    const out = remapIds([R("add", null, { name: "x", father_id: "tmp-1" }), R("update", "tmp-1", { name: "y" })], { "tmp-1": "real" });
    expect(out[0].payload.father_id).toBe("real");
    expect(out[1].person_id).toBe("real");
  });
});
