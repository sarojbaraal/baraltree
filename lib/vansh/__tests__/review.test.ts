import { describe, expect, it } from "vitest";
import { person } from "./fixtures";
import { reviewIssues } from "../review";

const P = (id: string, g: "M" | "F", birth: string | null, o = {}) => person({ id, name: id, gender: g, birth_bs: birth, ...o });

describe("reviewIssues", () => {
  it("flags child older than parent, wrong-gender parent, one-way spouse, partial sibling dates", () => {
    const ppl = [
      P("f", "M", "2000-01-01", { spouse_id: "m" }),
      P("m", "F", "2002-01-01"),
      P("a", "M", "1999-05-05", { father_id: "f", mother_id: "m" }),
      P("b", "M", "2030-00-00", { father_id: "f", mother_id: "m" }),
      P("c", "M", "2031-02-03", { father_id: "f", mother_id: "m" }),
      P("x", "F", "2020-01-01", { father_id: "m" }),
    ];
    const k = reviewIssues(ppl).map((i) => i.kind);
    expect(k).toContain("parent");
    expect(k).toContain("order");
    expect(k).toContain("gender");
    expect(k).toContain("spouse");
  });
  it("clean data → nothing", () => {
    const ppl = [P("f", "M", "1990-01-01", { spouse_id: "m" }), P("m", "F", "1992-01-01", { spouse_id: "f" }), P("a", "M", "2020-01-01", { father_id: "f", mother_id: "m" })];
    expect(reviewIssues(ppl)).toEqual([]);
  });
});
