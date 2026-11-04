// Lunar day (तिथि) and lunar month from astronomy — enough to find a श्राद्ध (death-anniversary) tithi every year.
//
// The day's tithi is the one running at sunrise (06:00 Nepal time). Sun and Moon positions use the low-precision
// formulas of the Astronomical Almanac (Moon ≈ 0.3°, i.e. about half an hour of tithi time), so a tithi that begins or
// ends within roughly an hour of sunrise can differ by one day from a printed पञ्चाङ्ग. The result is therefore shown
// as a reminder ("अनुमानित"), never as a ruling.
const RAD = Math.PI / 180;
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Julian Day of a UTC instant. */
const jd = (t: Date) => t.getTime() / 864e5 + 2440587.5;
const T = (j: number) => (j - 2451545.0) / 36525;

/** Tropical longitudes in degrees. */
export function sunLon(j: number): number {
  const t = T(j);
  const L0 = 280.46 + 36000.77 * t;
  const M = (357.528 + 35999.05 * t) * RAD;
  return mod(L0 + 1.915 * Math.sin(M) + 0.02 * Math.sin(2 * M), 360);
}
export function moonLon(j: number): number {
  const t = T(j);
  const s = (a: number, b: number) => Math.sin((a + b * t) * RAD);
  return mod(
    218.32 + 481267.881 * t + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22) +
      0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03),
    360
  );
}
/** Lahiri ayanamsa (degrees). */
const ayanamsa = (j: number) => 23.853 + 0.01397 * ((j - 2451545.0) / 365.25);
/** Sidereal Sun longitude: Mesha (0°) starts the Nepali month वैशाख. */
export const sunSidereal = (j: number) => mod(sunLon(j) - ayanamsa(j), 360);
/** Moon − Sun, 0..360 (a new moon is 0, a full moon 180). */
export const elongation = (j: number) => mod(moonLon(j) - sunLon(j), 360);

/** Instant (Julian day) of the new moon at or before `j`. */
function newMoonBefore(j: number): number {
  let x = j - (elongation(j) / 360) * 29.53;
  for (let i = 0; i < 5; i++) {
    const e = elongation(x);
    x -= (e > 180 ? e - 360 : e) / 12.19;
  }
  return x > j ? x - 29.53 : x;
}

export interface Panchang {
  /** 1..30: 1–15 शुक्ल पक्ष (15 = पूर्णिमा), 16–30 कृष्ण पक्ष (30 = औंसी). */
  tithi: number;
  /** Lunar month 0..11 = वैशाख … चैत्र, counted from new moon to new moon (amanta). */
  month: number;
  /** The lunar month contains no sankranti (अधिक मास). */
  adhik: boolean;
}

/** Sunrise (06:00 Nepal time = 00:15 UTC) of a calendar date. */
export const sunrise = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 0, 15) / 864e5 + 2440587.5;

export function panchangAt(j: number): Panchang {
  const tithi = Math.floor(elongation(j) / 12) + 1;
  const nm = newMoonBefore(j);
  const month = Math.floor(sunSidereal(nm) / 30);
  const next = newMoonBefore(nm + 29.53 + 1.5); // the new moon that ends this lunar month
  return { tithi, month, adhik: Math.floor(sunSidereal(next) / 30) === month };
}

export const panchangOn = (y: number, m: number, d: number) => panchangAt(sunrise(y, m, d));

const MONTHS = ["वैशाख", "ज्येष्ठ", "आषाढ", "श्रावण", "भाद्र", "आश्विन", "कार्तिक", "मार्गशीर्ष", "पौष", "माघ", "फाल्गुन", "चैत्र"];
const NAMES = ["प्रतिपदा", "द्वितीया", "तृतीया", "चतुर्थी", "पञ्चमी", "षष्ठी", "सप्तमी", "अष्टमी", "नवमी", "दशमी", "एकादशी", "द्वादशी", "त्रयोदशी", "चतुर्दशी"];

/** "भाद्र कृष्ण अष्टमी" — Nepali usage names a कृष्ण fortnight after the following lunar month (पूर्णिमान्त). */
export function tithiLabel(p: Panchang): string {
  const krishna = p.tithi > 15;
  const n = ((p.tithi - 1) % 15) + 1;
  const name = n === 15 ? (krishna ? "औंसी" : "पूर्णिमा") : NAMES[n - 1];
  return `${MONTHS[(p.month + (krishna ? 1 : 0)) % 12]} ${krishna ? "कृष्ण" : "शुक्ल"} ${name}`;
}

/** Same lunar month and tithi (अधिक मास are never matched: the observance goes to the regular month). */
export const sameTithi = (a: Panchang, b: Panchang) => !a.adhik && !b.adhik && a.tithi === b.tithi && a.month === b.month;
