import { describe, expect, it } from "vitest";
import { adToBsStr, bsToAdStr, daysUntilBs, neDate, todayBs } from "./bs";

describe("BS helpers", () => {
  it("converts AD to BS", () => {
    expect(adToBsStr("2026-04-14")).toBe("2083-01-01");
    expect(adToBsStr("2024-04-13")).toBe("2081-01-01");
    expect(adToBsStr("1988-06-02")).toBe("2045-02-20");
    expect(bsToAdStr("2083-01-01")).toBe("2026-04-14");
  });
  it("rejects dates outside the table or invalid", () => {
    expect(adToBsStr("1900-01-01")).toBeNull();
    expect(adToBsStr("2050-01-01")).toBeNull();
    expect(adToBsStr("2020-13-40")).toBeNull();
    expect(adToBsStr("2020-00-00")).toBeNull();
  });
  it("shows dates in Nepali words and digits", () => {
    expect(neDate("2044-05-22")).toBe("२०४४ भदौ २२");
    expect(neDate("2044-05-00")).toBe("२०४४ भदौ");
    expect(neDate("2044-00-00")).toBe("२०४४");
    expect(neDate("२०४५")).toBe("२०४५");
    expect(neDate("")).toBe("");
  });
  it("today and days until a birthday", () => {
    expect(todayBs(new Date(2026, 3, 14))).toEqual([2083, 1, 1]);
    expect(daysUntilBs("2050-01-01", new Date(2026, 3, 14))).toBe(0);
    expect(daysUntilBs("2050-01-03", new Date(2026, 3, 14))).toBe(2);
    expect(daysUntilBs("2050-00-00", new Date(2026, 3, 14))).toBeNull();
  });
});
