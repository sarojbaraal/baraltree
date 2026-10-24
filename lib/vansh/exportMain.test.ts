import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";
import { MAIN_COLS, mainRows, nearSubset } from "./exportMain";
import type { VPerson } from "./types";

const P = (id: string, o: Partial<VPerson> = {}) =>
  ({ id, name: id, gender: "M", father_id: null, mother_id: null, spouse_id: null, is_living: true, created_at: id, phone: "98", email: id + "@x", ...o }) as VPerson;

const people = [
  P("gf", { is_living: false }),
  P("f", { father_id: "gf" }),
  P("m", { gender: "F", spouse_id: "f" }),
  P("me", { father_id: "f", mother_id: "m", birth_place: "काठमाडौं" }),
  P("k", { father_id: "me" }),
  P("kk", { father_id: "k" }),
  P("kkk", { father_id: "kk" }),
  P("lock"),
];
people[1].spouse_id = "m";
const g = createGraph(people);

describe("mainRows", () => {
  const can = (id: string) => id !== "lock";
  it("has the agreed columns", () => expect(MAIN_COLS).toHaveLength(15));
  it("fills grandfather/father/mother", () => {
    const r = mainRows(g, { can, isStaff: true, myPosId: "me" }).find((x) => x[0] === "me")!;
    expect(r.slice(0, 4)).toEqual(["me", "gf", "f", "m"]);
    expect(r[5]).toBe("काठमाडौं");
  });
  it("hides contact for others, shows own", () => {
    const rows = mainRows(g, { can, isStaff: false, myPosId: "me" });
    expect(rows.find((x) => x[0] === "k")![11]).toBe("");
    expect(rows.find((x) => x[0] === "k")![12]).toBe("");
    expect(rows.find((x) => x[0] === "me")![12]).toBe("me@x");
  });
  it("marks parents as married even without a spouse", () => {
    const r = mainRows(g, { can, isStaff: true, myPosId: null }).find((x) => x[0] === "k")!;
    expect(r[9]).toBe("विवाहित");
    expect(mainRows(g, { can, isStaff: true, myPosId: null }).find((x) => x[0] === "kkk")![9]).toBe("अविवाहित");
  });
  it("skips people the viewer cannot access", () => {
    expect(mainRows(g, { can, isStaff: true, myPosId: null }).some((x) => x[0] === "lock")).toBe(false);
  });
});

describe("nearSubset", () => {
  it("is me ±7 generations plus spouses", () => {
    const ids = nearSubset(g, "me").map((p) => p.id).sort();
    expect(ids).toEqual(["f", "gf", "k", "kk", "kkk", "m", "me"]);
  });
});
