import { describe, expect, it } from "vitest";
import { family, person } from "./fixtures";
import { createGraph, computeAccess, makePerms, myRoles, premiumGrand } from "../graph";
import { relMap, relsOf, genNo, famGroups } from "../relations";
import { computeLayout, initialCollapsed, compactCollapsed, openUp, CW, CH } from "../layout";
import { ageN, bsNow, bsYear, composeDate, match, na, np, surnameOf, wifeNames } from "../text";
import { buildKidRequests, buildPersonPayload, groupBatches, guardRequest } from "../requests";
import { diffImport, parseImportRows } from "../importer";
import { csvText, jsonText, sheetRows } from "../exporters";
import type { VProfile, ChangeRequest } from "../types";

const meAt = (id: string, extra: Partial<VProfile> = {}): VProfile => ({
  id: "u1",
  email: "a@b.c",
  full_name: "T",
  role: "member",
  roles: ["general"],
  position_person_id: id,
  ...extra,
});

describe("text helpers", () => {
  it("converts digits both ways", () => {
    expect(np(2045)).toBe("२०४५");
    expect(na("२०४५-०५")).toBe("2045-05");
  });
  it("matches Latin queries against Devanagari names phonetically", () => {
    expect(match("राम बराल", "ram")).toBe(true);
    expect(match("राम बराल", "baral")).toBe(true);
    expect(match("राम बराल", "shyam")).toBe(false);
    expect(match("राम बराल", "बराल")).toBe(true);
  });
  it("extracts surnames", () => {
    expect(surnameOf("राम बराल")).toBe("बराल");
    expect(surnameOf("राम")).toBe("");
  });
  it("adds the husband's surname once, remembering the maiden name", () => {
    expect(wifeNames("सीता पौडेल", "", "", "बराल")).toEqual({ name: "सीता पौडेल बराल", maiden_name: "पौडेल", married_name: "बराल" });
    // already carries the husband's surname → unchanged name
    expect(wifeNames("सीता पौडेल बराल", "", "", "बराल")).toEqual({ name: "सीता पौडेल बराल", maiden_name: "पौडेल", married_name: "बराल" });
    // surname change: strip the previous married name first
    expect(wifeNames("सीता पौडेल बराल", "पौडेल", "बराल", "शर्मा")).toEqual({ name: "सीता पौडेल शर्मा", maiden_name: "पौडेल", married_name: "शर्मा" });
    expect(wifeNames("", "", "", "बराल")).toBeNull();
    expect(wifeNames("सीता", "", "", "")).toBeNull();
  });
  it("computes ages in BS years", () => {
    expect(ageN("2000-05-10", "2050-05-09")).toBe(49);
    expect(ageN("2000-05-10", "2050-05-10")).toBe(50);
    expect(ageN("2000", "2050")).toBe(50);
    expect(ageN("", "2050")).toBeNull();
    expect(ageN("2060-01-01", "2050-01-01")).toBeNull();
  });
  it("derives BS year around 14 April", () => {
    expect(bsYear(new Date(2026, 3, 13))).toBe(2082);
    expect(bsYear(new Date(2026, 3, 14))).toBe(2083);
    expect(bsNow(new Date(2026, 3, 14))[0]).toBe(2083);
  });
  it("composes dates with 00 for unknown parts", () => {
    expect(composeDate("२०४५", "", "")).toBe("2045-00-00");
    expect(composeDate("2045", "5", "2")).toBe("2045-05-02");
    expect(composeDate("", "5", "2")).toBe("");
  });
});

describe("graph", () => {
  const g = createGraph(family());
  it("finds spouses, kids and siblings", () => {
    expect(g.spousesOf(g.byId.hari)).toEqual(["gita"]);
    expect(g.kidsOf(g.byId.hari).map((p) => p.id).sort()).toEqual(["mina", "ram", "shyam"]);
    expect(g.sibsOf(g.byId.hari).map((p) => p.id)).toEqual(["dev"]);
  });
  it("marks in-laws as married-in", () => {
    expect(g.isMarriedIn(g.byId.gita)).toBe(true); // spouse of a person who has parents
    expect(g.isMarriedIn(g.byId.sita)).toBe(true);
    // two parentless spouses: exactly one is the "root" (tie broken by id, as in the original app)
    expect([g.isMarriedIn(g.byId.gopal), g.isMarriedIn(g.byId.laxmi)].filter(Boolean)).toHaveLength(1);
    expect(g.isMarriedIn(g.byId.dev)).toBe(false);
  });
  it("collects branches and descendants", () => {
    const b = g.branchOf(["ram"]);
    ["ram", "sita", "kiran", "hari", "gita", "gopal", "laxmi"].forEach((id) => expect(b.has(id)).toBe(true));
    expect(b.has("anil")).toBe(false);
    const d = g.downSet("hari");
    expect(d.has("anil")).toBe(true);
    expect(d.has("gopal")).toBe(false);
  });
  it("computes ancestor distances", () => {
    expect(g.ancUp("kiran")).toMatchObject({ kiran: 0, ram: 1, sita: 1, hari: 2, gopal: 3 });
  });
});

describe("kinship labels", () => {
  const g = createGraph(family());
  it("labels relatives of Ram", () => {
    const { R } = relMap(g, meAt("ram"));
    expect(R.ram).toBe("तपाईं");
    expect(R.sita).toBe("पत्नी");
    expect(R.kiran).toBe("छोरा");
    expect(R.hari).toBe("बुबा");
    expect(R.gita).toBe("आमा");
    expect(R.shyam).toBe("भाइ");
    expect(R.mina).toBe("बहिनी");
    expect(R.bikash).toBe("ज्वाइँ");
    expect(R.anil).toBe("भान्जा");
    expect(R.gopal).toBe("हजुरबुबा");
    expect(R.dev).toBe("काका");
  });
  it("labels from Mina's side", () => {
    const { R } = relMap(g, meAt("mina"));
    expect(R.ram).toBe("दाजु");
    expect(R.shyam).toBe("दाजु");
    expect(R.bikash).toBe("पति");
  });
  it("lists immediate family in display order", () => {
    const l = relsOf(g, g.byId.ram).map((x) => `${x.q.id}:${x.l}`);
    expect(l).toEqual(["hari:बुबा", "gita:आमा", "sita:पत्नी", "shyam:भाइ", "mina:बहिनी", "kiran:छोरा"]);
  });
  it("numbers generations", () => {
    expect(genNo(g, "gopal")).toBe(1);
    expect(genNo(g, "hari")).toBe(2);
    expect(genNo(g, "kiran")).toBe(4);
    expect(genNo(g, "gita")).toBe(2);
    expect(genNo(g, "kiran", () => 7)).toBe(8);
  });
  it("groups the family tab without duplicates", () => {
    const me = meAt("ram");
    const perms = makePerms("general", computeAccess(g, me, "general"));
    const { R } = relMap(g, me);
    const groups = famGroups(g, me, perms, R);
    const ids = groups.flatMap((x) => x.members.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(g.people.length);
    expect(groups[0].members.map((p) => p.id)).toContain("ram");
  });
});

describe("access rules", () => {
  it("expands admin to all roles and maps legacy member", () => {
    expect(myRoles({ id: "x", email: "", full_name: "", role: "admin" })).toEqual(["admin", "moderator", "premium", "general"]);
    expect(myRoles({ id: "x", email: "", full_name: "", role: "member", roles: [] })).toEqual(["general"]);
    expect(myRoles({ id: "x", email: "", full_name: "", role: "pending", roles: [] })).toEqual([]);
  });
  it("limits general users to unlocked people and premium editing to the grandfather's line", () => {
    const people = family().map((p) => ({ ...p, is_locked: p.id === "anil" }));
    const g = createGraph(people);
    const me = meAt("ram", { roles: ["premium"] });
    expect(premiumGrand(g, me)?.id).toBe("gopal");
    const perms = makePerms("premium", computeAccess(g, me, "premium"));
    expect(perms.can("anil")).toBe(false);
    expect(perms.can("ram")).toBe(true);
    expect(perms.nm(g.byId.anil)).toBe("••••••");
    expect(perms.canEdit("kiran")).toBe(true);
    const general = makePerms("general", computeAccess(g, me, "general"));
    expect(general.canEdit("ram")).toBe(false);
    expect(makePerms("moderator", computeAccess(g, me, "moderator")).canEdit("anil")).toBe(true);
  });
});

describe("chart layout", () => {
  const g = createGraph(family());
  const l = computeLayout(g, new Set());
  it("places every person once", () => {
    expect(l.cards.map((c) => c.p.id).sort()).toEqual(g.people.map((p) => p.id).sort());
  });
  it("never overlaps cards on a row", () => {
    const rows: Record<number, number[]> = {};
    l.cards.forEach((c) => (rows[c.y] ||= []).push(c.x));
    Object.values(rows).forEach((xs) => {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CW);
    });
    expect(l.H).toBeGreaterThan(CH);
    expect(l.W).toBeGreaterThanOrEqual(CW);
  });
  it("assigns generation depth", () => {
    expect(l.cardPos.gopal.d).toBe(0);
    expect(l.cardPos.kiran.d).toBe(3);
  });
  it("collapses and reopens branches", () => {
    const c = new Set(["hari"]);
    const folded = computeLayout(g, c);
    expect(folded.cards.length).toBeLessThan(l.cards.length);
    expect(folded.cardPos.ram).toBeUndefined();
    const opened = openUp(g, c, "ram");
    expect(opened.has("hari")).toBe(false);
    expect(computeLayout(g, opened).cardPos.ram).toBeDefined();
  });
  it("folds from generation 4 initially and compacts around the user", () => {
    expect(initialCollapsed(g).size).toBe(0);
    const compact = compactCollapsed(l, g.branchOf(["ram"]));
    expect(compact.has("hari")).toBe(false);
    expect(compact.has("bikash") || compact.has("mina")).toBe(true);
  });
});

describe("requests", () => {
  const g = createGraph(family());
  const me = meAt("ram", { roles: ["premium"] });
  const base = { name: "राम बराल", gender: "M", father_id: "hari", mother_id: "gita", spouse_id: "sita", is_living: true, birth_bs: "2025-01-01", death_bs: "", phone: "", address: "", notes: "" };
  const vals = (o: Record<string, string | boolean> = {}) => ({ ...base, father_name: "", mother_name: "", spouse_name: "", maiden_name: "", married_name: "", birth_place: "", ...o });

  it("sends only changed fields on update", () => {
    const r = buildPersonPayload({ action: "update", person: g.byId.ram, values: vals({ phone: "98" }), married: true }, () => true);
    expect(r.payload).toEqual({ phone: "98" });
  });
  it("reports no changes and bad dates", () => {
    expect(buildPersonPayload({ action: "update", person: g.byId.ram, values: vals(), married: true }, () => true).error).toMatch(/परिवर्तन/);
    expect(buildPersonPayload({ action: "update", person: g.byId.ram, values: vals({ birth_bs: "2025" }), married: true }, () => true).error).toMatch(/YYYY-MM-DD/);
    expect(buildPersonPayload({ action: "add", person: null, values: vals({ name: "" }), married: false }, () => true).error).toMatch(/नाम/);
  });
  it("clears death date for living people and married names for non-women", () => {
    const r = buildPersonPayload({ action: "add", person: null, values: vals({ death_bs: "2080-01-01", married_name: "X" }), married: true }, () => true);
    expect(r.payload?.death_bs).toBe("");
    expect(r.payload?.married_name).toBe("");
  });
  it("validates Facebook links", () => {
    const test = (u: string) => /facebook\.com/.test(u);
    expect(buildPersonPayload({ action: "update", person: g.byId.ram, values: vals(), married: true, facebook: "http://x.com" }, test).error).toMatch(/Facebook/);
    const ok = buildPersonPayload({ action: "update", person: g.byId.ram, values: vals(), married: true, facebook: "https://facebook.com/r" }, test);
    expect(ok.facebookChanged).toBe(true);
  });
  it("applies role guards", () => {
    const perm = (gr: typeof g, act: "general" | "premium" | "admin") => makePerms(act, computeAccess(gr, me, act));
    expect(guardRequest(perm(g, "general"), "update", "ram", {})).toMatch(/भूमिका/);
    expect(guardRequest(perm(g, "premium"), "update", "ram", {})).toBeNull();
    expect(guardRequest(perm(g, "admin"), "update", "ram", {})).toBeNull();
    const outside = createGraph([...family(), person({ id: "far", name: "टाढा", gender: "M" })]);
    const pm = perm(outside, "premium");
    expect(guardRequest(pm, "update", "far", {})).toMatch(/सम्पादन क्षेत्र/);
    expect(guardRequest(pm, "add", null, { name: "x" })).toMatch(/क्षेत्रभित्र/);
    expect(guardRequest(pm, "add", null, { father_id: "ram" })).toBeNull();
  });
  it("builds batched child requests", () => {
    const kid = { name: "नयाँ", gender: "F", is_living: true, birth_bs: "2070-01-01", birth_place: "", married: true, spouse: "हरि पौडेल" };
    const r = buildKidRequests(me, g.byId.ram, "sita", [kid, { ...kid, name: "  ", married: false }], "n", 1);
    expect(r.requests).toHaveLength(1);
    const p = r.requests![0].payload;
    expect(p).toMatchObject({ father_id: "ram", mother_id: "sita", name: "नयाँ पौडेल", married_name: "पौडेल", spouse_name: "हरि पौडेल" });
    expect(typeof p.batch).toBe("string");
    expect(buildKidRequests(me, g.byId.ram, "", [kid], "", 2).error).toMatch(/अर्को अभिभावक/);
    expect(buildKidRequests(me, g.byId.ram, "sita", [{ ...kid, birth_bs: "2070" }], "", 1).error).toMatch(/YYYY/);
    expect(buildKidRequests(me, g.byId.ram, "sita", [{ ...kid, name: "" }], "", 1).error).toMatch(/कम्तिमा/);
    const mother = buildKidRequests(me, g.byId.sita, "ram", [{ ...kid, married: false }], "", 1).requests![0].payload;
    expect(mother).toMatchObject({ mother_id: "sita", father_id: "ram" });
  });
  it("groups requests by batch", () => {
    const mk = (id: string, batch?: string) => ({ id, payload: batch ? { batch } : {} }) as unknown as ChangeRequest;
    const gr = groupBatches([mk("1", "a"), mk("2"), mk("3", "a")]);
    expect(gr.map((x) => x.items.map((i) => i.id))).toEqual([["1", "3"], ["2"]]);
  });
});

describe("import / export", () => {
  const g = createGraph(family());
  it("round-trips the exported sheet without changes", () => {
    const { rows } = parseImportRows(g, sheetRows(g) as unknown as Record<string, unknown>[]);
    const d = diffImport(g, rows);
    expect(d.add).toHaveLength(0);
    expect(d.chg).toEqual([]);
    expect(d.same).toBe(g.people.length);
  });
  it("detects edits and additions, resolving names to ids", () => {
    const rows = sheetRows(g) as unknown as Record<string, unknown>[];
    rows.find((r) => r.id === "ram")!.phone = "9800";
    rows.push({ id: "", name: "नयाँ", gender: "छोरा", father: "राम बराल", mother: "सीता बराल", spouse: "", is_living: "हो" });
    const { rows: out } = parseImportRows(g, rows);
    const d = diffImport(g, out);
    expect(d.chg).toHaveLength(1);
    expect(d.chg[0].ch).toEqual([{ k: "phone", a: "", b: "9800" }]);
    expect(d.add).toHaveLength(1);
    expect(out[out.length - 1]).toMatchObject({ gender: "M", father_id: "ram", mother_id: "sita", is_living: true });
  });
  it("rejects bad rows with row numbers", () => {
    expect(() => parseImportRows(g, [])).toThrow(/पङ्क्ति/);
    expect(() => parseImportRows(g, [{ id: "a", name: "", phone: "1" }])).toThrow(/पङ्क्ति 2: नाम खाली/);
    expect(() => parseImportRows(g, [{ id: "a", name: "A" }, { id: "a", name: "B" }])).toThrow(/id दोहोरिएको/);
    expect(() => parseImportRows(g, [{ id: "a", name: "A", father: "कोही छैन" }])).toThrow(/पङ्क्ति 2: बुबा/);
  });
  it("warns about Excel-converted dates and flags cleared data", () => {
    const rows = sheetRows(g) as unknown as Record<string, unknown>[];
    rows.find((r) => r.id === "ram")!.birth_bs = new Date(2025, 0, 2);
    const p = parseImportRows(g, rows);
    expect(p.dateWarn).toBe(1);
    const gg = createGraph(family().map((x) => (x.id === "sita" ? { ...x, address: "काठमाडौं" } : x)));
    expect(diffImport(gg, p.rows).cleared).toBe(1);
  });
  it("exports CSV with BOM and quoted cells, and JSON with all fields", () => {
    const csv = csvText(g);
    expect(csv.startsWith('﻿"id","name"')).toBe(true);
    expect(csv.split("\n")).toHaveLength(g.people.length + 1);
    const json = JSON.parse(jsonText(g.people));
    expect(json[0]).toHaveProperty("maiden_name", null);
    expect(json).toHaveLength(g.people.length);
  });
});
