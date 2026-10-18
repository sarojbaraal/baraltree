import type { VPerson } from "../types";

let n = 0;
export const person = (o: Partial<VPerson> & { id: string; name: string }): VPerson => ({
  gender: null,
  father_id: null,
  mother_id: null,
  spouse_id: null,
  more_spouse_ids: [],
  is_living: true,
  created_at: `2020-01-${String(++n).padStart(2, "0")}`,
  ...o,
});

/**
 * Gopal m. Laxmi
 *   ├─ Hari (b.2000) m. Gita
 *   │    ├─ Ram (b.2025) m. Sita ── Kiran (b.2050)
 *   │    ├─ Shyam (b.2030)
 *   │    └─ Mina (b.2035) m. Bikash ── Anil (b.2060)
 *   └─ Dev (b.2003) ── Pooja (b.2030)
 */
export const family = (): VPerson[] => [
  person({ id: "gopal", name: "गोपाल बराल", gender: "M", spouse_id: "laxmi", birth_bs: "1975-01-01" }),
  person({ id: "laxmi", name: "लक्ष्मी बराल", gender: "F", spouse_id: "gopal", birth_bs: "1980-01-01" }),
  person({ id: "hari", name: "हरि बराल", gender: "M", father_id: "gopal", mother_id: "laxmi", spouse_id: "gita", birth_bs: "2000-01-01" }),
  person({ id: "dev", name: "देव बराल", gender: "M", father_id: "gopal", mother_id: "laxmi", birth_bs: "2003-01-01" }),
  person({ id: "gita", name: "गीता बराल", gender: "F", spouse_id: "hari", birth_bs: "2002-01-01" }),
  person({ id: "ram", name: "राम बराल", gender: "M", father_id: "hari", mother_id: "gita", spouse_id: "sita", birth_bs: "2025-01-01" }),
  person({ id: "shyam", name: "श्याम बराल", gender: "M", father_id: "hari", mother_id: "gita", birth_bs: "2030-01-01" }),
  person({ id: "mina", name: "मिना बराल", gender: "F", father_id: "hari", mother_id: "gita", spouse_id: "bikash", birth_bs: "2035-01-01" }),
  person({ id: "sita", name: "सीता बराल", gender: "F", spouse_id: "ram", birth_bs: "2027-01-01" }),
  person({ id: "bikash", name: "विकास पौडेल", gender: "M", spouse_id: "mina", birth_bs: "2033-01-01" }),
  person({ id: "kiran", name: "किरण बराल", gender: "M", father_id: "ram", mother_id: "sita", birth_bs: "2050-01-01" }),
  person({ id: "anil", name: "अनिल पौडेल", gender: "M", father_id: "bikash", mother_id: "mina", birth_bs: "2060-01-01" }),
  person({ id: "pooja", name: "पूजा बराल", gender: "F", father_id: "dev", birth_bs: "2030-01-01" }),
];
