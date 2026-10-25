import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";
import { planPosterPages } from "./posterPlan";
import type { VPerson } from "./types";

const P = (id: string, f?: string): VPerson => ({ id, name: id, gender: "M", is_living: true, father_id: f ?? null, mother_id: null, spouse_id: null, more_spouse_ids: [] } as unknown as VPerson);

describe("planPosterPages", () => {
  it("keeps small trees on one page and splits big ones with cut links", () => {
    const small = createGraph([P("r"), P("a", "r"), P("b", "r")]);
    expect(planPosterPages(small, 40)).toHaveLength(1);
    const ppl = [P("r")];
    for (let i = 0; i < 6; i++) {
      ppl.push(P("c" + i, "r"));
      for (let j = 0; j < 8; j++) ppl.push(P(`g${i}_${j}`, "c" + i), P(`h${i}_${j}`, `g${i}_${j}`));
    }
    const pages = planPosterPages(createGraph(ppl), 20);
    expect(pages.length).toBeGreaterThan(1);
    const seen = new Set(pages.flatMap((p) => p.ids));
    expect(seen.size).toBe(ppl.length);
    for (const pg of pages) for (const [id, to] of Object.entries(pg.cuts)) expect(pages[to].from).toEqual({ page: pg.idx, id });
  });
});

import { computeLayout, POSTER_DIMS } from "./layout";
describe("hanging column layout", () => {
  it("narrows a family of many childless children without losing anyone or overlapping", () => {
    const ppl = [P("r"), ...Array.from({ length: 9 }, (_, i) => P("k" + i, "r"))];
    const g = createGraph(ppl);
    const flat = computeLayout(g, new Set(), POSTER_DIMS);
    const st = computeLayout(g, new Set(), { ...POSTER_DIMS, stack: 4 });
    expect(st.cards).toHaveLength(10);
    expect(st.W).toBeLessThan(flat.W / 3);
    expect(st.H).toBeGreaterThan(flat.H);
    const ys = st.cards.filter((c) => c.d === 1).map((c) => c.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(POSTER_DIMS.ch);
  });
});
