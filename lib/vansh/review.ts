// "सम्बन्ध समीक्षा": finds data that makes kinship words wrong or missing, so an admin can fix it at the source.
import { ageN, na } from "./text";
import { unresolvedCohorts } from "./kinship";
import type { VPerson } from "./types";

export type IssueKind = "order" | "parent" | "gender" | "spouse" | "dup" | "age" | "nodate";
export interface Issue {
  /** Stable key (used to remember "ignored"). */
  key: string;
  kind: IssueKind;
  /** error = the kinship word will be wrong; warn = suspicious; info = missing data. */
  level: "error" | "warn" | "info";
  title: string;
  detail: string;
  /** People involved (first one is where to fix). */
  ids: string[];
}

export const KIND_LABEL: Record<IssueKind, string> = {
  order: "🔢 जन्मक्रम",
  parent: "👪 अभिभावक–सन्तान",
  gender: "⚥ लिङ्ग",
  spouse: "💍 पति/पत्नी",
  dup: "👥 दोहोरो नाम",
  age: "🎂 उमेर",
  nodate: "📅 मिति छुटेको",
};
export const KIND_ORDER: IssueKind[] = ["order", "parent", "gender", "spouse", "dup", "age", "nodate"];

const year = (d?: string | null) => parseInt(na(d || "").split("-")[0], 10) || 0;

export function reviewIssues(people: VPerson[]): Issue[] {
  const out: Issue[] = [];
  const by: Record<string, VPerson> = {};
  people.forEach((p) => (by[p.id] = p));
  const nm = (p?: VPerson | null) => p?.name || "?";

  // 1. sibling groups whose birth order cannot be named
  unresolvedCohorts({ people }).forEach((c) => {
    const who = c.gender === "M" ? "छोराहरू" : "छोरीहरू";
    const level = c.problem === "धेरै सन्तान" ? "warn" : "error";
    out.push({
      key: `order:${c.parent?.id}:${c.gender}`,
      kind: "order",
      level,
      title: `${nm(c.parent)} का ${who}: ${c.problem}`,
      detail:
        c.problem === "तारिख अधुरो"
          ? "सबैको साल-महिना-गते पूरा भरेपछि मात्र जेठो/माइलो/कान्छो तोकिन्छ। अधुरा: " +
            c.members.filter((m) => !m.birth_bs || /(^|-)0+(-|$)/.test(m.birth_bs) || m.birth_bs.split("-").length < 3).map((m) => `${m.name} (${m.birth_bs || "—"})`).join(", ")
          : c.problem === "तारिख दोहोरिएको"
          ? "दुईजनाको जन्म मिति उस्तै छ, त्यसैले कसलाई जेठो भन्ने थाहा भएन।"
          : `${c.members.length} जना छन्; शब्द ११ जनासम्म मात्र छन्।`,
      ids: c.members.map((m) => m.id),
    });
  });

  people.forEach((p) => {
    // 2. parent / child
    [["बुबा", p.father_id], ["आमा", p.mother_id]].forEach(([label, pid]) => {
      const par = pid ? by[pid] : undefined;
      if (!par) return;
      const py = year(par.birth_bs), cy = year(p.birth_bs);
      if (py && cy && cy <= py)
        out.push({ key: `parent:${p.id}:${par.id}`, kind: "parent", level: "error", title: `${nm(p)} ${label} भन्दा जेठो/समवयस्क देखियो`,
          detail: `${nm(p)} (${p.birth_bs}) को ${label} ${nm(par)} (${par.birth_bs}) हुन्। जन्म वर्ष वा अभिभावक जाँच्नुहोस्।`, ids: [p.id, par.id] });
      else if (py && cy && cy - py < 13)
        out.push({ key: `parent:${p.id}:${par.id}`, kind: "parent", level: "warn", title: `${nm(p)} र ${label} बीच ${cy - py} वर्ष मात्र फरक`,
          detail: `${nm(par)} (${par.birth_bs}) → ${nm(p)} (${p.birth_bs})`, ids: [p.id, par.id] });
    });
    // 3. father must be M, mother F
    const f = p.father_id ? by[p.father_id] : undefined;
    const m = p.mother_id ? by[p.mother_id] : undefined;
    if (f && f.gender && f.gender !== "M")
      out.push({ key: `gender:f:${p.id}`, kind: "gender", level: "error", title: `${nm(p)} को बुबा "${nm(f)}" पुरुष छैन`, detail: "बुबाको लिङ्ग वा बुबा/आमा खाना जाँच्नुहोस्।", ids: [f.id, p.id] });
    if (m && m.gender && m.gender !== "F")
      out.push({ key: `gender:m:${p.id}`, kind: "gender", level: "error", title: `${nm(p)} को आमा "${nm(m)}" महिला छैन`, detail: "आमाको लिङ्ग वा बुबा/आमा खाना जाँच्नुहोस्।", ids: [m.id, p.id] });
    // 4. spouse link must go both ways
    [p.spouse_id, ...(p.more_spouse_ids || [])].filter(Boolean).forEach((sid) => {
      const s = by[sid as string];
      if (!s) return;
      if (s.spouse_id !== p.id && !(s.more_spouse_ids || []).includes(p.id) && p.id < s.id)
        out.push({ key: `spouse:${p.id}:${s.id}`, kind: "spouse", level: "warn", title: `${nm(p)} → ${nm(s)}: एकतर्फी जोडी`, detail: `${nm(s)} को प्रोफाइलमा ${nm(p)} पति/पत्नीका रूपमा छैन।`, ids: [p.id, s.id] });
      if (s.gender && p.gender && s.gender === p.gender && p.id < s.id)
        out.push({ key: `spouse-g:${p.id}:${s.id}`, kind: "spouse", level: "warn", title: `${nm(p)} र ${nm(s)} को लिङ्ग एउटै छ`, detail: "दुवै " + (p.gender === "M" ? "पुरुष" : "महिला") + " छन्; लिङ्ग जाँच्नुहोस्।", ids: [p.id, s.id] });
    });
    // 6. age
    const a = p.is_living ? ageN(p.birth_bs, null) : null;
    if (a != null && a > 105)
      out.push({ key: `age:${p.id}`, kind: "age", level: "warn", title: `${nm(p)}: जीवित, उमेर ${a} वर्ष`, detail: "दिवंगत भएको भए 'दिवंगत' जनाउनुहोस्।", ids: [p.id] });
    if (!p.is_living && p.birth_bs && p.death_bs && year(p.death_bs) && year(p.death_bs) < year(p.birth_bs))
      out.push({ key: `age-d:${p.id}`, kind: "age", level: "error", title: `${nm(p)}: मृत्यु जन्मभन्दा अघि`, detail: `${p.birth_bs} → ${p.death_bs}`, ids: [p.id] });
  });

  // 5. same name under the same father
  const seen: Record<string, VPerson> = {};
  people.forEach((p) => {
    if (!p.father_id) return;
    const k = p.father_id + "|" + p.name.trim();
    if (seen[k]) out.push({ key: `dup:${seen[k].id}:${p.id}`, kind: "dup", level: "warn", title: `"${p.name}" दुईपटक (एउटै बुबा)`, detail: "एउटै व्यक्ति दोहोरिएको हुन सक्छ।", ids: [seen[k].id, p.id] });
    else seen[k] = p;
  });

  // 7. missing birth date — one line, not 200 cards
  const nod = people.filter((p) => !p.birth_bs || year(p.birth_bs) === 0);
  if (nod.length)
    out.push({ key: "nodate", kind: "nodate", level: "info", title: `${nod.length} जनाको जन्म साल छैन`,
      detail: "जन्म साल नभए दाजु/भाइ, दिदी/बहिनी, जेठो/कान्छो छुट्याउन सकिँदैन।", ids: nod.map((p) => p.id) });

  const rank = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
