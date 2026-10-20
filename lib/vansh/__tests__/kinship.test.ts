import { describe, expect, it } from "vitest";
import { person } from "./fixtures";
import { createGraph } from "../graph";
import { kinFor, kinFrom, kinshipBetween, ordinalOf, ordinalWord, withAnchor } from "../kinship";
import type { VPerson } from "../types";

const P = (id: string, g: "M" | "F", birth: string | null, o: Partial<VPerson> = {}) =>
  person({ id, name: id, gender: g, birth_bs: birth, ...o });

/**
 * Paternal grandparents gf+gm: bada(1990)+badaW, phupuO(1992)+phupuOH, hari(1995, my father)+gita+step, phupuY(1998)+phupuYH, kaka(2000)+kakiW
 * Maternal grandparents mgf+mgm: thuli(1994)+thuliH, mama(1996)+maiju, gita(1997, my mother), sani(2000)+saniH
 * Me ram(2025) with dajyu(2020)+bhauju, didi(2022)+bhinaju, bhai(2030)+buhari, bahini(2028)+jwai, halfBro(2033, father hari, mother step)
 */
const data = (): VPerson[] => [
  P("gf", "M", "1960", { spouse_id: "gm" }),
  P("gm", "F", "1965", { spouse_id: "gf" }),
  P("bada", "M", "1990", { father_id: "gf", mother_id: "gm", spouse_id: "badaW" }),
  P("badaW", "F", "1992", { spouse_id: "bada" }),
  P("phupuO", "F", "1992", { father_id: "gf", mother_id: "gm", spouse_id: "phupuOH" }),
  P("phupuOH", "M", "1990", { spouse_id: "phupuO" }),
  P("hari", "M", "1995", { father_id: "gf", mother_id: "gm", spouse_id: "gita", more_spouse_ids: ["step"] }),
  P("phupuY", "F", "1998", { father_id: "gf", mother_id: "gm", spouse_id: "phupuYH" }),
  P("phupuYH", "M", "1997", { spouse_id: "phupuY" }),
  P("kaka", "M", "2000", { father_id: "gf", mother_id: "gm", spouse_id: "kakiW" }),
  P("kakiW", "F", "2001", { spouse_id: "kaka" }),
  P("mgf", "M", "1962", { spouse_id: "mgm" }),
  P("mgm", "F", "1966", { spouse_id: "mgf" }),
  P("thuli", "F", "1994", { father_id: "mgf", mother_id: "mgm", spouse_id: "thuliH" }),
  P("thuliH", "M", "1993", { spouse_id: "thuli" }),
  P("mama", "M", "1996", { father_id: "mgf", mother_id: "mgm", spouse_id: "maiju" }),
  P("maiju", "F", "1998", { spouse_id: "mama" }),
  P("gita", "F", "1997", { father_id: "mgf", mother_id: "mgm", spouse_id: "hari" }),
  P("sani", "F", "2000", { father_id: "mgf", mother_id: "mgm", spouse_id: "saniH" }),
  P("saniH", "M", "1999", { spouse_id: "sani" }),
  P("step", "F", "2003", { spouse_id: "hari" }),
  P("dajyu", "M", "2020", { father_id: "hari", mother_id: "gita", spouse_id: "bhauju" }),
  P("bhauju", "F", "2021", { spouse_id: "dajyu" }),
  P("didi", "F", "2022", { father_id: "hari", mother_id: "gita", spouse_id: "bhinaju" }),
  P("bhinaju", "M", "2020", { spouse_id: "didi" }),
  P("ram", "M", "2025", { father_id: "hari", mother_id: "gita", spouse_id: "sita" }),
  P("bahini", "F", "2028", { father_id: "hari", mother_id: "gita", spouse_id: "jwai" }),
  P("jwai", "M", "2027", { spouse_id: "bahini" }),
  P("bhai", "M", "2030", { father_id: "hari", mother_id: "gita", spouse_id: "buhari" }),
  P("buhari", "F", "2031", { spouse_id: "bhai" }),
  P("halfBro", "M", "2033", { father_id: "hari", mother_id: "step" }),
  // my wife's family
  P("sita", "F", "2027", { father_id: "sasur", mother_id: "sasu", spouse_id: "ram" }),
  P("sasur", "M", "2000"),
  P("sasu", "F", "2002"),
  P("sala", "M", "2024", { father_id: "sasur", mother_id: "sasu" }),
  P("sali", "F", "2029", { father_id: "sasur", mother_id: "sasu", spouse_id: "sadhu" }),
  P("sadhu", "M", "2028", { spouse_id: "sali" }),
  // my children
  P("kiran", "M", "2050", { father_id: "ram", mother_id: "sita" }),
  P("beti", "F", "2052", { father_id: "ram", mother_id: "sita", spouse_id: "jwai2" }),
  P("jwai2", "M", "2051", { spouse_id: "beti" }),
  P("nati", "M", "2075", { father_id: "kiran" }),
  P("natini", "F", "2076", { father_id: "beti" }),
  // nephews/nieces and cousins
  P("bhatija", "M", "2045", { father_id: "dajyu", mother_id: "bhauju" }),
  P("bhanja", "M", "2046", { father_id: "bhinaju", mother_id: "didi" }),
  P("kakaSon", "M", "2027", { father_id: "kaka", mother_id: "kakiW" }),
  P("phupuDau", "F", "2023", { father_id: "phupuOH", mother_id: "phupuO", spouse_id: "phupuDauH" }),
  P("phupuDauH", "M", "2022", { spouse_id: "phupuDau" }),
  P("phupuGrand", "M", "2048", { father_id: "phupuDauH", mother_id: "phupuDau" }),
  P("mamaSon", "M", "2029", { father_id: "mama", mother_id: "maiju" }),
  P("mamaSonW", "F", "2030", { spouse_id: "mamaSon" }),
  P("mamaSonKid", "M", "2052", { father_id: "mamaSon", mother_id: "mamaSonW" }),
  P("badaSon", "M", "2022", { father_id: "bada", mother_id: "badaW" }),
  P("badaSonKid", "F", "2049", { father_id: "badaSon" }),
];

const R = (from = "ram") => kinFrom(data(), from).R;

describe("kinship dictionary (from ram)", () => {
  const r = R();
  it("self, parents, grandparents", () => {
    expect(r.ram).toBe("तपाईं");
    expect(r.hari).toBe("बुबा");
    expect(r.gita).toBe("आमा");
    expect(r.gf).toBe("हजुरबुबा");
    expect(r.gm).toBe("हजुरआमा");
    expect(r.mgf).toBe("हजुरबुबा");
    expect(r.mgm).toBe("हजुरआमा");
  });
  it("siblings by age", () => {
    expect(r.dajyu).toBe("दाजु");
    expect(r.didi).toBe("दिदी");
    expect(r.bhai).toBe("भाइ");
    expect(r.bahini).toBe("बहिनी");
  });
  it("paternal uncles and aunts", () => {
    expect(r.bada).toBe("ठूलोबुबा");
    expect(r.kaka).toBe("काका");
    expect(r.phupuO).toBe("ठूलीफुपू");
    expect(r.phupuY).toBe("सानीफुपू");
  });
  it("maternal uncles and aunts", () => {
    expect(r.mama).toBe("मामा");
    expect(r.thuli).toBe("ठूलीआमा");
    expect(r.sani).toBe("सानिमा");
  });
  it("uncles' spouses", () => {
    expect(r.badaW).toBe("ठूलीआमा");
    expect(r.kakiW).toBe("काकी");
    expect(r.maiju).toBe("माइजू");
    expect(r.phupuOH).toBe("फुपाजु");
    expect(r.phupuYH).toBe("फुपाजु");
  });
  it("siblings' spouses", () => {
    expect(r.bhinaju).toBe("भिनाजु");
    expect(r.jwai).toBe("ज्वाइँ");
    expect(r.bhauju).toBe("भाउजू");
    expect(r.buhari).toBe("बुहारी");
  });
  it("nephews and nieces", () => {
    expect(r.bhatija).toBe("भतिजा");
    expect(r.bhanja).toBe("भान्जा");
  });
  it("collapses cousins to siblings by age, and their kin accordingly", () => {
    expect(r.kakaSon).toBe("भाइ"); // father's brother's son, younger
    expect(r.phupuDau).toBe("दिदी"); // फुपूको छोरी, older
    expect(r.phupuDauH).toBe("भिनाजु"); // फुपूको छोरीको पति — never a long phrase
    expect(r.mamaSon).toBe("भाइ");
    expect(r.mamaSonW).toBe("बुहारी");
    expect(r.phupuGrand).toBe("भान्जा"); // फुपूका छोराछोरीका सन्तान
    expect(r.mamaSonKid).toBe("भान्जा");
    expect(r.badaSonKid).toBe("भतिजी"); // father's brother's son's child
    expect(r.phupuGrand).toBe("भान्जा");
    // a father's brother's DAUGHTER's child is भान्जा, like a sister's child
    const d = [...data(), P("kakaDau", "F", "2026", { father_id: "kaka", mother_id: "kakiW" }), P("kakaDauKid", "M", "2050", { mother_id: "kakaDau" })];
    expect(kinFrom(d, "ram").R.kakaDauKid).toBe("भान्जा");
  });
  it("spouse, children, grandchildren", () => {
    expect(r.sita).toBe("पत्नी");
    expect(r.kiran).toBe("छोरा");
    expect(r.beti).toBe("छोरी");
    expect(r.jwai2).toBe("ज्वाइँ");
    expect(r.nati).toBe("नाति");
    expect(r.natini).toBe("नातिनी");
  });
  it("in-laws", () => {
    expect(r.sasur).toBe("ससुरा");
    expect(r.sasu).toBe("सासू");
    expect(r.sala).toBe("साला");
    expect(r.sali).toBe("साली");
    expect(r.sadhu).toBe("साढु");
  });
  it("never returns long descriptive strings", () => {
    Object.values(r).forEach((t) => expect(t.includes("को ")).toBe(false));
  });
});

describe("step relatives (father has two wives, mother recorded)", () => {
  const r = R();
  it("labels the father's other wife सौतेनी आमा and the half brother सौतेनो भाइ", () => {
    expect(r.step).toBe("सौतेनी आमा");
    expect(r.halfBro).toBe("सौतेनो भाइ");
    expect(r.gita).toBe("आमा");
  });
  it("from the half brother's side the other wife is सौतेनी आमा too", () => {
    const h = R("halfBro");
    expect(h.step).toBe("आमा");
    expect(h.gita).toBe("सौतेनी आमा");
    expect(h.ram).toBe("सौतेनो दाजु");
  });
  it("a single wife is never सौतेनी, even when no mother id is recorded", () => {
    const d = data().map((p) => (p.id === "ram" ? { ...p, mother_id: null } : p));
    expect(kinFrom(d, "ram").R.gita).toBe("आमा");
    expect(kinFrom(d, "dajyu").R.gita).toBe("आमा");
  });
  it("a father with two wives and no mother recorded stays plain आमा", () => {
    const d = data().map((p) => (p.id === "ram" ? { ...p, mother_id: null } : p));
    // normalisation only fills the mother when the father has one wife, so here it is unknown
    expect(kinFrom(d, "ram").R.step).toBe("आमा");
  });
  it("mother with two husbands: second husband is सौतेनो बुबा", () => {
    const d = [
      P("m", "F", "1990", { spouse_id: "h1", more_spouse_ids: ["h2"] }),
      P("h1", "M", "1988", { spouse_id: "m" }),
      P("h2", "M", "1985", { spouse_id: "m" }),
      P("c", "M", "2015", { father_id: "h1", mother_id: "m" }),
    ];
    const r2 = kinFrom(d, "c").R;
    expect(r2.h1).toBe("बुबा");
    expect(r2.h2).toBe("सौतेनो बुबा");
  });
});

describe("anchors", () => {
  it("uses a real position first", () => {
    const k = kinFor(data(), { position_person_id: "ram", position_parent_id: null });
    expect(k.R.hari).toBe("बुबा");
    expect(k.C.has("dajyu")).toBe(true);
    expect(k.C.has("gf")).toBe(false);
  });
  it("custom anchor 'son of hari' behaves like ram without age", () => {
    const k = kinFor(data(), { position_person_id: null, position_parent_id: null, custom_anchor: { target_id: "hari", relation_type: "son" } });
    expect(k.R.hari).toBe("बुबा");
    // hari has two wives and no mother is recorded for a virtual child, so neither is called सौतेनी
    expect(k.R.gita).toBe("आमा");
    expect(k.R.step).toBe("आमा");
  });
  it("custom anchor husband of sita: sita is पत्नी and her father is ससुरा", () => {
    const k = kinFor(data(), { position_person_id: null, position_parent_id: null, custom_anchor: { target_id: "sita", relation_type: "husband" } });
    expect(k.R.sita).toBe("पत्नी");
    expect(k.R.sasur).toBe("ससुरा");
  });
  it("custom anchor brother of dajyu shares the parents", () => {
    const k = kinFor(data(), { position_person_id: null, position_parent_id: null, custom_anchor: { target_id: "dajyu", relation_type: "brother" } });
    expect(k.R.hari).toBe("बुबा");
    expect(k.R.dajyu).toBe("दाजु/भाइ");
  });
  it("falls back to position_parent as a child of that parent", () => {
    const a = withAnchor(data(), { position_person_id: null, position_parent_id: "hari" });
    expect(a.anchorId).toBe("__me__");
    const k = kinFor(data(), { position_person_id: null, position_parent_id: "hari" });
    expect(k.R.hari).toBe("बुबा");
    expect(k.R.dajyu).toBe("दाजु/भाइ"); // no birth date for the virtual child → age unknown
  });
  it("no anchor → no labels", () => {
    expect(kinFor(data(), { position_person_id: null, position_parent_id: null }).anchorId).toBeNull();
  });
});

describe("kinshipBetween / ordinals", () => {
  const g = createGraph(data());
  it("answers for any pair", () => {
    expect(kinshipBetween(g, "ram", "hari")).toBe("बुबा");
    expect(kinshipBetween(g, "hari", "ram")).toBe("छोरा");
    expect(kinshipBetween(g, "kiran", "ram")).toBe("बुबा");
    expect(kinshipBetween(g, "bhai", "kaka")).toBe("काका");
  });
  it("ranks sons: जेठो, माइलो, साइलो, कान्छो", () => {
    // dajyu 2020, ram 2025, bhai 2030, halfBro 2033
    expect(ordinalOf(g, "dajyu")).toBe("जेठो");
    expect(ordinalOf(g, "ram")).toBe("माइलो");
    expect(ordinalOf(g, "bhai")).toBe("साइलो");
    expect(ordinalOf(g, "halfBro")).toBe("कान्छो");
  });
  it("the last born is always कान्छो, whatever the count", () => {
    expect(ordinalWord(1, 2, false)).toBe("जेठो");
    expect(ordinalWord(2, 2, false)).toBe("कान्छो");
    expect(ordinalWord(2, 3, false)).toBe("माइलो");
    expect(ordinalWord(3, 3, true)).toBe("कान्छी");
    expect(ordinalWord(4, 5, false)).toBe("काइँलो");
    expect(ordinalWord(9, 9, true)).toBe("कान्छी");
    expect(ordinalWord(1, 1, false)).toBeNull();
  });
  it("only one of that gender → no ordinal; unknown birth → none", () => {
    expect(ordinalOf(g, "didi")).toBe("जेठी");
    expect(ordinalOf(g, "bahini")).toBe("कान्छी");
    const d = data().map((p) => (p.id === "bhai" ? { ...p, birth_bs: null } : p));
    expect(ordinalOf(createGraph(d), "ram")).toBeNull();
  });
});
