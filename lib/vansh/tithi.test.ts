import { describe, expect, it } from "vitest";
import { panchangOn, sameTithi, tithiLabel } from "./tithi";

// festival days, known from printed पञ्चाङ्ग (tithi at sunrise)
const cases: [string, number, number, number, string][] = [
  ["Krishna Janmashtami", 2025, 8, 16, "भाद्र कृष्ण अष्टमी"],
  ["Vijaya Dashami", 2025, 10, 2, "आश्विन शुक्ल दशमी"],
  ["Laxmi Puja (Tihar)", 2025, 10, 21, "कार्तिक कृष्ण औंसी"],
  ["Holi (Fagun Purnima)", 2025, 3, 14, "फाल्गुन शुक्ल पूर्णिमा"],
  ["Ram Navami", 2025, 4, 6, "चैत्र शुक्ल नवमी"],
  ["Janai Purnima", 2025, 8, 9, "श्रावण शुक्ल पूर्णिमा"],
  ["Haritalika Teej", 2025, 8, 26, "भाद्र शुक्ल तृतीया"],
];

describe("tithi from astronomy", () => {
  it.each(cases)("%s", (_n, y, m, d, label) => {
    expect(tithiLabel(panchangOn(y, m, d))).toBe(label);
  });
  it("the same tithi comes back next year about 354 days later (± a month for the lunar year)", () => {
    const a = panchangOn(2025, 8, 16);
    let hit = "";
    for (let i = 330; i < 400 && !hit; i++) {
      const dt = new Date(Date.UTC(2025, 7, 16 + i));
      if (sameTithi(a, panchangOn(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()))) hit = dt.toISOString().slice(0, 10);
    }
    expect(hit).toBe("2026-09-04"); // Bhadra Krishna Ashtami 2026
  });
});
