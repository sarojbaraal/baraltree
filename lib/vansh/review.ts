// "सम्बन्ध समीक्षा": finds data that makes kinship words wrong or missing, so an admin can fix it at the source.
import { ageN, na, np } from "./text";
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
  /** What is wrong, in one plain sentence. */
  detail: string;
  /** What it breaks in the kinship words. */
  impact: string;
  /** Concrete steps to correct it. */
  steps: string[];
  /** People involved (first one is where to fix). */
  ids: string[];
  /** One line per person: their part in the problem, and whether this is the entry to correct. */
  rows: IssueRow[];
}
export interface IssueRow {
  id: string;
  role: string;
  /** Short note shown next to the person (e.g. the missing/odd value). */
  note?: string;
  /** true = this is the entry that most likely needs correcting. */
  fix?: boolean;
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

const partial = (d?: string | null) => !d || d.split("-").length < 3 || d.split("-").some((x, i) => i > 0 && !(parseInt(na(x), 10) > 0)) || year(d) === 0;
const dateNote = (p: VPerson) => (p.birth_bs ? p.birth_bs : "जन्म मिति छैन");

export function reviewIssues(people: VPerson[]): Issue[] {
  const out: Issue[] = [];
  const by: Record<string, VPerson> = {};
  people.forEach((p) => (by[p.id] = p));
  const nm = (p?: VPerson | null) => p?.name || "?";

  // 1. sibling groups whose birth order cannot be named
  unresolvedCohorts({ people }).forEach((c) => {
    const who = c.gender === "M" ? "छोरा" : "छोरी";
    const bad = c.members.filter((m) => partial(m.birth_bs));
    const sameDate = c.problem === "तारिख दोहोरिएको";
    const words = c.problem === "धेरै सन्तान" ? "" : c.members.length === 2 ? "जेठो / कान्छो" : "जेठो, माइलो … कान्छो";
    out.push({
      key: `order:${c.parent?.id}:${c.gender}`,
      kind: "order",
      level: c.problem === "धेरै सन्तान" ? "warn" : "error",
      title: `${nm(c.parent)} का ${np(c.members.length)} ${who}: जन्मक्रम तोकिएन`,
      detail:
        c.problem === "तारिख अधुरो"
          ? `${np(bad.length)} जनाको जन्म मिति पूरा (साल-महिना-गते) छैन।`
          : sameDate
          ? "दुई जनाको जन्म मिति बिलकुल उस्तै छ।"
          : `एउटै बुबाका ${c.members.length} ${who} छन्; क्रमका शब्द ११ जनासम्म मात्र छन्।`,
      impact: `यिनीहरूको काका/मामा/फुपू हुन् भने "माइलो काका", "कान्छी फुपू" जस्ता शब्द बन्न सक्दैन — केवल "काका", "फुपू" देखिन्छ।`,
      steps:
        c.problem === "तारिख अधुरो"
          ? ["तलका ❗ चिह्न भएका सदस्यको नाम थिचेर ✏ सच्याउनुहोस्।", "जन्म मिति साल-महिना-गते तीनै भाग भर्नुहोस् (थाहा छैन भने परिवारसँग सोध्नुहोस्)।", `सबैको मिति भरेपछि यो कार्ड आफैं हट्छ र ${words} तोकिन्छ।`]
          : sameDate
          ? ["❗ चिह्न भएका दुईजनाको मिति तुलना गर्नुहोस्।", "एउटाको मिति सच्याउनुहोस् (जुम्ल्याहा भए एक दिनको फरकमा भए पनि फरक राख्नुहोस्)।"]
          : ["यदि दुई परिवार मिसिएका हुन् भने आमा/बुबा सही छन् कि जाँच्नुहोस्।", "सही हो भने 'यो ठीक छ, बेवास्ता' थिच्नुहोस्।"],
      ids: c.members.map((m) => m.id),
      rows: c.members.map((m) => {
        const isBad = c.problem === "तारिख अधुरो" ? partial(m.birth_bs) : c.problem === "तारिख दोहोरिएको" ? c.members.some((x) => x.id !== m.id && x.birth_bs === m.birth_bs) : false;
        return { id: m.id, role: who, note: isBad ? (m.birth_bs ? `${m.birth_bs} — अधुरो` : "जन्म मिति छैन") : dateNote(m), fix: isBad };
      }),
    });
  });

  people.forEach((p) => {
    // 2. parent / child
    (([["बुबा", p.father_id], ["आमा", p.mother_id]]) as [string, string | null | undefined][]).forEach(([label, pid]) => {
      const par = pid ? by[pid] : undefined;
      if (!par) return;
      const py = year(par.birth_bs), cy = year(p.birth_bs);
      const both = py && cy;
      if (both && cy <= py)
        out.push({
          key: `parent:${p.id}:${par.id}`, kind: "parent", level: "error",
          title: `${nm(p)} आफ्नो ${label} भन्दा जेठो/समवयस्क देखियो`,
          detail: `${nm(par)} (${par.birth_bs}) ${nm(p)} (${p.birth_bs}) को ${label} हुन् — सन्तान अभिभावकभन्दा अघि जन्मिन सक्दैन।`,
          impact: "वरिपरिका सबै नाता (काका, मामा, दाजु-भाइ) उल्टो उमेरले छुट्याइन्छ, त्यसैले ठूलोबुबा/काका, दाजु/भाइ गलत आउँछ।",
          steps: ["दुवैको जन्म साल मिलाउनुहोस्।", `वा ${nm(p)} को ${label} अर्को व्यक्ति हो भने अभिभावक बदल्नुहोस्।`],
          ids: [p.id, par.id],
          rows: [{ id: par.id, role: label, note: par.birth_bs || "", fix: false }, { id: p.id, role: "सन्तान", note: p.birth_bs || "", fix: true }],
        });
      else if (both && cy - py < 13)
        out.push({
          key: `parent:${p.id}:${par.id}`, kind: "parent", level: "warn",
          title: `${nm(p)} र ${label} बीच ${cy - py} वर्ष मात्र फरक`,
          detail: `${nm(par)} (${par.birth_bs}) → ${nm(p)} (${p.birth_bs}) — १३ वर्षभन्दा कम फरक सम्भव कम हुन्छ।`,
          impact: "साल गलत भए उमेरमा आधारित नाता (दाजु/भाइ, ठूलो/सानो) बिग्रन्छ।",
          steps: ["दुवैको जन्म साल जाँच्नुहोस्।", "सही हो भने 'यो ठीक छ, बेवास्ता' थिच्नुहोस्।"],
          ids: [p.id, par.id],
          rows: [{ id: par.id, role: label, note: par.birth_bs || "" }, { id: p.id, role: "सन्तान", note: p.birth_bs || "", fix: true }],
        });
    });
    // 3. father must be M, mother F
    const f = p.father_id ? by[p.father_id] : undefined;
    const m = p.mother_id ? by[p.mother_id] : undefined;
    if (f && f.gender && f.gender !== "M")
      out.push({
        key: `gender:f:${p.id}`, kind: "gender", level: "error",
        title: `${nm(p)} को बुबा "${nm(f)}" पुरुष छैन`, detail: `${nm(f)} को लिङ्ग "${f.gender === "F" ? "महिला" : "अन्य"}" दर्ता छ तर ${nm(p)} को बुबाका रूपमा जोडिएको छ।`,
        impact: "बुबाको लिङ्गबाट काका/फुपू, मामा/माइजू छुट्याइन्छ — यहाँ गलत शब्द आउँछ।",
        steps: [`${nm(f)} को लिङ्ग ठीक छ कि हेर्नुहोस्।`, `ठीक भए ${nm(p)} को बुबा/आमा खाना सटाइएको हुन सक्छ — ✏ ले सच्याउनुहोस्।`],
        ids: [f.id, p.id], rows: [{ id: f.id, role: "बुबा (दर्ता)", note: "लिङ्ग: " + (f.gender === "F" ? "महिला" : "अन्य"), fix: true }, { id: p.id, role: "सन्तान" }],
      });
    if (m && m.gender && m.gender !== "F")
      out.push({
        key: `gender:m:${p.id}`, kind: "gender", level: "error",
        title: `${nm(p)} को आमा "${nm(m)}" महिला छैन`, detail: `${nm(m)} को लिङ्ग "${m.gender === "M" ? "पुरुष" : "अन्य"}" दर्ता छ तर ${nm(p)} को आमाका रूपमा जोडिएको छ।`,
        impact: "आमाको पट्टिका नाता (मामा, माइजू, मावली) गलत शब्दमा आउँछ।",
        steps: [`${nm(m)} को लिङ्ग ठीक छ कि हेर्नुहोस्।`, `ठीक भए ${nm(p)} को बुबा/आमा खाना सटाइएको हुन सक्छ — ✏ ले सच्याउनुहोस्।`],
        ids: [m.id, p.id], rows: [{ id: m.id, role: "आमा (दर्ता)", note: "लिङ्ग: " + (m.gender === "M" ? "पुरुष" : "अन्य"), fix: true }, { id: p.id, role: "सन्तान" }],
      });
    // 4. spouse link must go both ways
    [p.spouse_id, ...(p.more_spouse_ids || [])].filter(Boolean).forEach((sid) => {
      const s = by[sid as string];
      if (!s) return;
      if (s.spouse_id !== p.id && !(s.more_spouse_ids || []).includes(p.id) && p.id < s.id)
        out.push({
          key: `spouse:${p.id}:${s.id}`, kind: "spouse", level: "warn",
          title: `${nm(p)} → ${nm(s)}: एकतर्फी जोडी`,
          detail: `${nm(p)} ले ${nm(s)} लाई पति/पत्नी जनाएको छ, तर ${nm(s)} को प्रोफाइलमा ${nm(p)} छैन।`,
          impact: "एकतर्फी जोडीले ससुराली नाता (साला, भिनाजु, ज्वाइँ) केही दृश्यमा छुट्न सक्छ।",
          steps: [`${nm(s)} को प्रोफाइल खोली ✏ मा पति/पत्नी ${nm(p)} राख्नुहोस्।`],
          ids: [s.id, p.id], rows: [{ id: p.id, role: "जोडिएको", note: "→ " + nm(s) }, { id: s.id, role: "फर्किएको छैन", note: "पति/पत्नी खाली/अर्को", fix: true }],
        });
      if (s.gender && p.gender && s.gender === p.gender && p.id < s.id)
        out.push({
          key: `spouse-g:${p.id}:${s.id}`, kind: "spouse", level: "warn",
          title: `${nm(p)} र ${nm(s)} को लिङ्ग एउटै छ`, detail: `दुवै ${p.gender === "M" ? "पुरुष" : "महिला"} दर्ता छन्।`,
          impact: "पति/पत्नीको लिङ्गबाट भाउजू/बुहारी/भिनाजु जस्ता शब्द छुट्टिन्छन्।",
          steps: ["दुवैमध्ये कसको लिङ्ग गलत हो हेर्नुहोस् र ✏ ले सच्याउनुहोस्।"],
          ids: [p.id, s.id], rows: [{ id: p.id, role: "जोडी", note: p.gender === "M" ? "पुरुष" : "महिला" }, { id: s.id, role: "जोडी", note: s.gender === "M" ? "पुरुष" : "महिला" }],
        });
    });
    // 6. age
    const a = p.is_living ? ageN(p.birth_bs, null) : null;
    if (a != null && a > 105)
      out.push({
        key: `age:${p.id}`, kind: "age", level: "warn", title: `${nm(p)}: जीवित देखिएका छन्, उमेर ${a} वर्ष`,
        detail: `जन्म ${p.birth_bs}, तर "जीवित" दर्ता छ।`, impact: "दिवंगत जनाएपछि मात्र नामअघि 'स्व.' देखिन्छ।",
        steps: ["दिवंगत भएको भए ✏ मा 'दिवंगत' छानी मृत्यु मिति भर्नुहोस्।", "जन्म साल गलत भए सच्याउनुहोस्।"],
        ids: [p.id], rows: [{ id: p.id, role: "व्यक्ति", note: `${p.birth_bs} · उमेर ${a}`, fix: true }],
      });
    if (!p.is_living && p.birth_bs && p.death_bs && year(p.death_bs) && year(p.death_bs) < year(p.birth_bs))
      out.push({
        key: `age-d:${p.id}`, kind: "age", level: "error", title: `${nm(p)}: मृत्यु जन्मभन्दा अघि`,
        detail: `जन्म ${p.birth_bs} → मृत्यु ${p.death_bs}`, impact: "उमेर गलत (शून्य) देखिन्छ।",
        steps: ["जन्म र मृत्यु मितिमध्ये गलत साल सच्याउनुहोस्।"],
        ids: [p.id], rows: [{ id: p.id, role: "व्यक्ति", note: `${p.birth_bs} → ${p.death_bs}`, fix: true }],
      });
  });

  // 5. same name under the same father
  const seen: Record<string, VPerson> = {};
  people.forEach((p) => {
    if (!p.father_id) return;
    const k = p.father_id + "|" + p.name.trim();
    if (seen[k]) {
      const o = seen[k];
      out.push({
        key: `dup:${o.id}:${p.id}`, kind: "dup", level: "warn", title: `"${p.name}" दुईपटक दर्ता (एउटै बुबा)`,
        detail: "एउटै बुबाका एउटै नामका दुई प्रविष्टि छन् — दोहोरिएको हुन सक्छ।",
        impact: "दोहोरिएको व्यक्तिले सन्तान/जोडी छुट्टाछुट्टै जोडिएर नाता बाँडिन्छ।",
        steps: ["दुवैको जन्म मिति, जोडी र सन्तान तुलना गर्नुहोस्।", "एउटै हो भने एउटा हटाउने अनुरोध गर्नुहोस् (सन्तान/जोडी मिलाएपछि)।", "फरक व्यक्ति हुन् भने 'बेवास्ता' थिच्नुहोस्।"],
        ids: [o.id, p.id],
        rows: [o, p].map((x) => ({ id: x.id, role: "प्रविष्टि", note: `${x.birth_bs || "मिति छैन"} · सन्तान ${people.filter((c) => c.father_id === x.id || c.mother_id === x.id).length}` })),
      });
    } else seen[k] = p;
  });

  // 7. missing birth date — one card, not 200
  const nod = people.filter((p) => !p.birth_bs || year(p.birth_bs) === 0);
  if (nod.length)
    out.push({
      key: "nodate", kind: "nodate", level: "info", title: `${np(nod.length)} जनाको जन्म साल छैन`,
      detail: "जन्म साल नभएकाहरूको उमेर तुलना गर्न सकिँदैन।",
      impact: "दाजु/भाइ, दिदी/बहिनी, ठूलोबुबा/काका, जेठो/कान्छो छुट्याउन सकिँदैन, त्यसैले साइनो खाली वा अस्पष्ट देखिन्छ।",
      steps: ["तलको सूचीबाट एक-एक जना खोलेर ✏ मा जन्म साल भर्नुहोस्।", "ठ्याक्कै थाहा छैन भने साल मात्र भरे पनि पुग्छ (जस्तै २०४५)।"],
      ids: nod.map((p) => p.id),
      rows: nod.map((p) => ({ id: p.id, role: p.gender === "M" ? "पुरुष" : p.gender === "F" ? "महिला" : "व्यक्ति", note: "जन्म साल छैन", fix: true })),
    });

  const rank = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
