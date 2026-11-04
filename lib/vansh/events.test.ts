import { describe, expect, it } from "vitest";
import { person } from "./__tests__/fixtures";
import { familyEvents, whenLabel } from "./events";

// "today" = 2083-01-01 BS = 2026-04-14 AD
const NOW = new Date(2026, 3, 14, 10, 0);
const P = (id: string, o: Record<string, unknown> = {}) => person({ id, name: id, gender: "M", ...o } as never);

describe("family events", () => {
  const people = [
    P("me", { birth_bs: "2050-04-20" }),
    P("tom", { birth_bs: "2040-01-03" }), // in 2 days
    P("late", { birth_bs: "2040-12-30" }), // passed (last year)
    P("rec", { birth_bs: "2040-12-29" }),
    P("far", { birth_bs: "2040-08-10" }),
    P("unk", { birth_bs: "2040-00-00" }),
    P("w", { gender: "F", marriage_bs: "2060-01-02", spouse_id: "h" }),
    P("h", { spouse_id: "w", marriage_bs: "2060-01-02" }),
    P("dead", { is_living: false, birth_bs: "2000-01-01", death_bs: "2082-05-02" }), // Bhadra Krishna Ashtami area (Aug 2025)
    P("old", { is_living: false, death_bs: "1970-05-02" }), // before the calendar table starts (BS 1980)
  ];
  const r = familyEvents(people, { now: NOW, can: () => true, meId: "me" });
  it("own birthday is always counted, however far", () => {
    expect(r.own?.person.id).toBe("me");
    expect(r.own!.days).toBeGreaterThan(90);
    expect(r.upcoming.some((e) => e.person.id === "me")).toBe(false);
  });
  it("birthdays within a week, with the age they turn", () => {
    const e = r.upcoming.find((x) => x.person.id === "tom")!;
    expect(e.days).toBe(2);
    expect(e.detail).toBe("४३ वर्ष पुग्दै");
    expect(r.upcoming.some((x) => x.person.id === "far" || x.person.id === "unk")).toBe(false);
  });
  it("birthdays of the last week are listed separately", () => {
    expect(r.recent.map((x) => x.person.id)).toContain("rec");
    expect(r.recent.find((x) => x.person.id === "rec")!.days).toBeLessThan(0);
  });
  it("one anniversary per couple", () => {
    expect(r.upcoming.filter((x) => x.kind === "anniversary").length).toBe(1);
    expect(r.upcoming.find((x) => x.kind === "anniversary")!.days).toBe(1);
  });
  it("locked people never appear", () => {
    const r2 = familyEvents(people, { now: NOW, can: (id) => id !== "tom", meId: "me" });
    expect(r2.upcoming.some((x) => x.person.id === "tom")).toBe(false);
  });
  it("labels", () => {
    expect([0, 1, 3, -1, -3].map(whenLabel)).toEqual(["आज", "भोलि", "३ दिनमा", "हिजो", "३ दिन अघि"]);
  });
  it("shraddha: the death tithi comes round in the right week", () => {
    // died 2082-05-02 BS = 2025-08-19 AD; find the day this week (from 2026-09-0x) where the tithi repeats
    const now = new Date(2026, 8, 3);
    const rr = familyEvents(people, { now, can: () => true, meId: "me", ahead: 7 });
    const s = rr.upcoming.find((x) => x.kind === "shraddha");
    expect(s?.person.id).toBe("dead");
    expect(s!.detail).toMatch(/कृष्ण|शुक्ल/);
    expect(rr.upcoming.some((x) => x.person.id === "old")).toBe(false);
  });
});
