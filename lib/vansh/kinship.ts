// Nepali kinship engine.
//
// From one anchor person (the signed-in user, or any person) it finds the shortest path to everybody else with a
// Dijkstra/BFS over four kinds of steps and turns that path into the right Nepali term:
//   f = बुबा (to father)   m = आमा (to mother)   s = छोरा (to son)   d = छोरी (to daughter)
//   h = पति (to husband)   w = पत्नी (to wife)
// Long paths are collapsed first ("फुपूको छोरीको पति" → दिदी/बहिनी by age → भिनाजु/ज्वाइँ), so a term is always one
// short word, never a description. Terms that cannot be named exactly are left out (null) instead of guessed.
import type { VPerson, VProfile } from "./types";
import type { Graph } from "./graph";
import { na, np } from "./text";

export type Step = "f" | "m" | "s" | "d" | "h" | "w";

export const VIRTUAL_ME = "__me__";
export type AnchorRelation = "son" | "daughter" | "father" | "mother" | "husband" | "wife" | "brother" | "sister";
export const ANCHOR_RELATIONS: AnchorRelation[] = ["son", "daughter", "father", "mother", "husband", "wife", "brother", "sister"];
export interface CustomAnchor {
  target_id: string;
  relation_type: AnchorRelation | string;
}

export interface Kin {
  /** id → Nepali term (people without an exact term are absent). */
  R: Record<string, string>;
  /** id → step path from the anchor, e.g. "ffd". */
  paths: Record<string, string>;
  /** Immediate family of the anchor (used to highlight and order the family tab). */
  C: Set<string>;
  /** The person the paths start from (a real id, or VIRTUAL_ME). */
  anchorId: string | null;
}

// ---------------------------------------------------------------- helpers

const isM = (p?: VPerson | null) => p?.gender === "M";
const isF = (p?: VPerson | null) => p?.gender === "F";
/** Pick a term by the person's gender; unknown gender gets `o` (default "m/f"). */
const by = (p: VPerson | undefined | null, m: string, f: string, o = `${m}/${f}`) => (isM(p) ? m : isF(p) ? f : o);

/** Parses a BS date into [year, month, day]; 0 = unknown part. */
function dateParts(d?: string | null): [number, number, number] | null {
  if (!d) return null;
  const q = na(String(d)).split("-").map((x) => parseInt(x, 10) || 0);
  return q[0] > 0 ? [q[0], q[1] || 0, q[2] || 0] : null;
}
const fullDate = (d?: string | null) => {
  const q = dateParts(d);
  return !!q && q[1] > 0 && q[2] > 0;
};

/**
 * true = a is older than b, false = younger, null = cannot be told (missing, same, or an unknown month/day that
 * would decide it). Compares year, then month, then day; a 00 part stops the comparison.
 */
export function olderThan(a?: VPerson | null, b?: VPerson | null): boolean | null {
  const x = dateParts(a?.birth_bs);
  const y = dateParts(b?.birth_bs);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (i > 0 && (!x[i] || !y[i])) return null;
    if (x[i] !== y[i]) return x[i] < y[i];
  }
  return null;
}

// ---------------------------------------------------------------- adjacency

interface Net {
  people: VPerson[];
  byId: Record<string, VPerson>;
  kids: Record<string, VPerson[]>;
  spouses: Record<string, string[]>;
}

/**
 * Builds the working graph. A child with only one parent recorded gets the other parent filled in when that parent
 * has exactly one spouse (the app's data convention), so "सौतेनी" is judged on complete parent data.
 */
function buildNet(people: VPerson[]): Net {
  const byId: Record<string, VPerson> = {};
  people.forEach((p) => (byId[p.id] = p));
  const spouses: Record<string, string[]> = {};
  const link = (a: string, b: string) => {
    if (!byId[a] || !byId[b] || a === b) return;
    const l = (spouses[a] ||= []);
    if (!l.includes(b)) l.push(b);
  };
  people.forEach((p) => {
    [p.spouse_id, ...(p.more_spouse_ids || [])].forEach((s) => {
      if (s) {
        link(p.id, s);
        link(s, p.id);
      }
    });
  });
  const only = (id: string) => (spouses[id]?.length === 1 ? byId[spouses[id][0]] : undefined);
  const norm = people.map((p) => {
    let { father_id, mother_id } = p;
    if (father_id && !mother_id) {
      const s = only(father_id);
      if (s && isF(s)) mother_id = s.id;
    } else if (mother_id && !father_id) {
      const s = only(mother_id);
      if (s && isM(s)) father_id = s.id;
    }
    return father_id === p.father_id && mother_id === p.mother_id ? p : { ...p, father_id, mother_id };
  });
  const nb: Record<string, VPerson> = {};
  norm.forEach((p) => (nb[p.id] = p));
  const kids: Record<string, VPerson[]> = {};
  norm.forEach((c) => {
    [c.father_id, c.mother_id].forEach((par) => {
      if (par && nb[par]) (kids[par] ||= []).push(c);
    });
  });
  return { people: norm, byId: nb, kids, spouses };
}

/** Shortest paths from `start`. Spouse steps cost a little more, so blood routes win ties. */
function search(net: Net, start: string): Record<string, { path: string; nodes: string[] }> {
  const best: Record<string, { cost: number; path: string; nodes: string[] }> = {
    [start]: { cost: 0, path: "", nodes: [start] },
  };
  const done = new Set<string>();
  const open: string[] = [start];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (best[open[i]].cost < best[open[bi]].cost) bi = i;
    const x = open.splice(bi, 1)[0];
    if (done.has(x)) continue;
    done.add(x);
    const p = net.byId[x];
    const cur = best[x];
    const go = (id: string | null | undefined, step: Step, w: number) => {
      if (!id || !net.byId[id] || done.has(id)) return;
      const cost = cur.cost + w;
      const old = best[id];
      if (!old || cost < old.cost - 1e-9) {
        best[id] = { cost, path: cur.path + step, nodes: [...cur.nodes, id] };
        open.push(id);
      }
    };
    go(p.father_id, "f", 1);
    go(p.mother_id, "m", 1);
    (net.kids[x] || []).forEach((c) => go(c.id, isF(c) ? "d" : "s", 1));
    (net.spouses[x] || []).forEach((s) => go(s, isF(net.byId[s]) ? "w" : "h", 1.1));
  }
  const out: Record<string, { path: string; nodes: string[] }> = {};
  Object.keys(best).forEach((id) => (out[id] = { path: best[id].path, nodes: best[id].nodes }));
  return out;
}

// ---------------------------------------------------------------- terms

/** Sibling-like person at my generation (sibling or cousin) → दाजु / भाइ / दिदी / बहिनी by age. */
function siblingTerm(me: VPerson, t: VPerson): string {
  const o = olderThan(t, me);
  return isM(t)
    ? o === true ? "दाजु" : o === false ? "भाइ" : "दाजु/भाइ"
    : isF(t)
    ? o === true ? "दिदी" : o === false ? "बहिनी" : "दिदी/बहिनी"
    : "दाजुभाइ/दिदीबहिनी";
}

/** Share exactly one parent (the other parent known on both sides and different). */
function isHalf(a: VPerson, b: VPerson): boolean {
  const sf = !!a.father_id && a.father_id === b.father_id;
  const sm = !!a.mother_id && a.mother_id === b.mother_id;
  if (sf && sm) return false;
  if (sf) return !!a.mother_id && !!b.mother_id && a.mother_id !== b.mother_id;
  if (sm) return !!a.father_id && !!b.father_id && a.father_id !== b.father_id;
  return false;
}

/** Father's / mother's sibling, judged against my parent `par` (cousins of my parent collapse to the same terms). */
function uncleTerm(first: string, t: VPerson, par: VPerson): string {
  const o = olderThan(t, par);
  if (first === "f")
    return isM(t)
      ? o === true ? "ठूलोबुबा" : o === false ? "काका" : "ठूलोबुबा/काका"
      : isF(t)
      ? o === true ? "ठूलीफुपू" : o === false ? "सानीफुपू" : "फुपू"
      : "काका/फुपू";
  return isM(t)
    ? "मामा"
    : isF(t)
    ? o === true ? "ठूलीआमा" : o === false ? "सानिमा" : "ठूलीआमा/सानिमा"
    : "मामा/मौसी";
}

/** My sibling-like person's spouse: older sister's husband = भिनाजु, younger = ज्वाइँ; older brother's wife = भाउजू, younger = बुहारी. */
function sibSpouseTerm(me: VPerson, r: VPerson): string | null {
  const o = olderThan(r, me);
  if (isF(r)) return o === true ? "भिनाजु" : o === false ? "ज्वाइँ" : "भिनाजु/ज्वाइँ";
  if (isM(r)) return o === true ? "भाउजू" : o === false ? "बुहारी" : "भाउजू/बुहारी";
  return null;
}

/** Spouse of a blood relative `r` who is `u` generations up and `k` down. nodes[0] = me. */
function spouseOfBlood(u: number, k: number, s: string, nodes: VPerson[], t: VPerson, sc: SpouseCount): string | null {
  const me = nodes[0];
  const r = nodes[nodes.length - 2];
  const first = s[0];
  if (u === 0 && k === 0) return by(t, "पति", "पत्नी", "जीवनसाथी");
  if (k === 0) {
    if (u === 1) {
      // my parent's other spouse: step-parent only when my own parent on that side is known and is someone else
      if (isF(t)) {
        return sc(nodes[1]) > 1 && me.mother_id && me.mother_id !== t.id ? "सौतेनी आमा" : "आमा";
      }
      return sc(nodes[1]) > 1 && me.father_id && me.father_id !== t.id ? "सौतेनो बुबा" : "बुबा";
    }
    if (u === 2) return by(t, "हजुरबुबा", "हजुरआमा");
    return "पुर्खा";
  }
  if (u === 0) {
    if (k === 1) return isM(r) ? "बुहारी" : isF(r) ? "ज्वाइँ" : "बुहारी/ज्वाइँ";
    if (k === 2) return isM(r) ? "नाति-बुहारी" : isF(r) ? "नातिनी-ज्वाइँ" : null;
    return null;
  }
  const d = u - k;
  if (d === 0) return sibSpouseTerm(me, r);
  if (d === 1) {
    const par = nodes[1];
    if (first === "f")
      return isM(r)
        ? olderThan(r, par) === true ? "ठूलीआमा" : olderThan(r, par) === false ? "काकी" : "ठूलीआमा/काकी"
        : isF(r) ? "फुपाजु" : null;
    return isM(r) ? "माइजू" : isF(r) ? (olderThan(r, par) === true ? "ठूलोबा" : "सानाबा") : null;
  }
  if (d === -1) return isM(r) ? "बुहारी" : isF(r) ? "ज्वाइँ" : null;
  if (d >= 2) return by(t, "हजुरबुबा", "हजुरआमा");
  return null;
}

type SpouseCount = (p: VPerson) => number;
const ownSpouseCount: SpouseCount = (p) => (p.spouse_id ? 1 : 0) + (p.more_spouse_ids?.length || 0);

/** Pure blood path: u steps up, then k steps down. */
function bloodTerm(u: number, k: number, s: string, nodes: VPerson[], t: VPerson): string | null {
  const me = nodes[0];
  if (u === 0 && k === 0) return "तपाईं";
  if (k === 0) {
    if (u === 1) return s === "f" ? "बुबा" : "आमा";
    if (u === 2) return by(t, "हजुरबुबा", "हजुरआमा");
    return "पुर्खा";
  }
  if (u === 0) {
    if (k === 1) return by(t, "छोरा", "छोरी", "सन्तान");
    if (k === 2) return by(t, "नाति", "नातिनी");
    return "वंशज";
  }
  const d = u - k;
  if (d === 0) {
    const base = siblingTerm(me, t);
    if (u === 1 && isHalf(me, t)) return (isF(t) ? "सौतेनी " : "सौतेनो ") + base;
    return base;
  }
  if (d === 1) return uncleTerm(s[0], t, nodes[1]);
  if (d === -1) {
    // child of a sibling-like person: a brother's (or father's brother's son's) children = भतिजा/भतिजी, any other line = भान्जा/भान्जी
    const sib = nodes[nodes.length - 2];
    const brotherLine = isM(sib) && (u === 1 || (s[0] === "f" && isM(nodes[u + 1])));
    return brotherLine ? by(t, "भतिजा", "भतिजी") : by(t, "भान्जा", "भान्जी");
  }
  if (d >= 2) return by(t, "हजुरबुबा", "हजुरआमा");
  return by(t, "नाति", "नातिनी");
}

/** Term for the person at the end of `path`, or null when there is no exact word. */
export function termForPath(path: string, nodes: VPerson[], sc: SpouseCount = ownSpouseCount): string | null {
  const t = nodes[nodes.length - 1];
  const me = nodes[0];
  if (!path) return "तपाईं";

  let m = /^([fm]*)([sd]*)$/.exec(path);
  if (m) return bloodTerm(m[1].length, m[2].length, path, nodes, t);

  m = /^([fm]*)([sd]*)([hw])$/.exec(path);
  if (m) return spouseOfBlood(m[1].length, m[2].length, path.slice(0, -1), nodes, t, sc);

  if (path === "hw" || path === "wh") return isF(me) && isF(t) ? "सौता" : null;

  // spouse's relatives
  m = /^[hw]([fm]*)([sd]*)$/.exec(path);
  if (m) {
    const u = m[1].length;
    const k = m[2].length;
    const spouse = nodes[1];
    const meMale = !isF(me);
    if (k === 0 && u === 1) return by(t, "ससुरा", "सासू");
    if (k === 0 && u === 2) return by(t, "हजुरबुबा", "हजुरआमा");
    if (u === 1 && k === 1) {
      if (meMale) return by(t, "साला", "साली");
      return isM(t)
        ? olderThan(t, spouse) === true ? "जेठाजु" : olderThan(t, spouse) === false ? "देवर" : "जेठाजु/देवर"
        : "नन्द";
    }
    if (u === 0 && k === 1) return by(t, "सौतेनो छोरा", "सौतेनी छोरी", "सौतेनो सन्तान");
    if (u === 0 && k === 2) return by(t, "नाति", "नातिनी");
    if (u === 1 && k === 2) {
      if (meMale) return by(t, "भान्जा", "भान्जी");
      return isM(nodes[nodes.length - 2]) ? by(t, "भतिजा", "भतिजी") : by(t, "भान्जा", "भान्जी");
    }
    return null;
  }
  // spouse's sibling's spouse
  m = /^[hw]([fm]*)([sd]*)([hw])$/.exec(path);
  if (m && m[1].length === 1 && m[2].length === 1) {
    const sib = nodes[nodes.length - 2];
    const spouse = nodes[1];
    if (!isF(me)) return isF(sib) && isM(t) ? "साढु" : null;
    if (isM(sib)) return olderThan(sib, spouse) === true ? "जेठानी" : olderThan(sib, spouse) === false ? "देउरानी" : "जेठानी/देउरानी";
    return null;
  }
  return null;
}

// ---------------------------------------------------------------- anchors

/** Returns the people list with a virtual "me" added according to a custom anchor, and the anchor's id. */
export function withAnchor(
  people: VPerson[],
  me: Pick<VProfile, "position_person_id" | "position_parent_id"> & { custom_anchor?: CustomAnchor | null }
): { people: VPerson[]; anchorId: string | null } {
  const byId: Record<string, VPerson> = {};
  people.forEach((p) => (byId[p.id] = p));
  const ca = me.custom_anchor;
  const target = ca?.target_id ? byId[ca.target_id] : undefined;
  const rel = ca?.relation_type as AnchorRelation | undefined;
  if (target && rel && ANCHOR_RELATIONS.includes(rel)) return virtual(people, target, rel);
  if (me.position_person_id && byId[me.position_person_id]) return { people, anchorId: me.position_person_id };
  const par = me.position_parent_id ? byId[me.position_parent_id] : undefined;
  if (par) return virtual(people, par, "child");
  return { people, anchorId: null };
}

function virtual(people: VPerson[], t: VPerson, rel: AnchorRelation | "child"): { people: VPerson[]; anchorId: string } {
  const gender = ({ son: "M", daughter: "F", father: "M", mother: "F", husband: "M", wife: "F", brother: "M", sister: "F", child: null } as const)[rel];
  const v: VPerson = {
    id: VIRTUAL_ME,
    name: "तपाईं",
    gender,
    father_id: null,
    mother_id: null,
    spouse_id: null,
    more_spouse_ids: [],
    is_living: true,
    birth_bs: null,
    created_at: "9999",
  };
  let list = people;
  if (rel === "son" || rel === "daughter" || rel === "child") {
    if (isF(t)) v.mother_id = t.id;
    else v.father_id = t.id;
  } else if (rel === "brother" || rel === "sister") {
    v.father_id = t.father_id;
    v.mother_id = t.mother_id;
  } else if (rel === "husband" || rel === "wife") {
    v.spouse_id = t.id;
    list = people.map((p) => (p.id === t.id ? { ...p, more_spouse_ids: [...(p.more_spouse_ids || []), VIRTUAL_ME] } : p));
  } else {
    // father / mother of the target
    list = people.map((p) =>
      p.id === t.id ? (rel === "father" ? { ...p, father_id: VIRTUAL_ME } : { ...p, mother_id: VIRTUAL_ME }) : p
    );
  }
  return { people: [...list, v], anchorId: VIRTUAL_ME };
}

// ---------------------------------------------------------------- public API

const CORE = [
  /^[fmsdhw]$/, // parents, children, spouse
  /^[fm][sd]$/, // siblings
  /^[fm][sd][hw]$/, // siblings' spouses
  /^[fm][sd][sd]$/, // siblings' children
  /^f[fm]s$/, // father's brothers
  /^f[fm]sw$/, // and their wives
  /^[hw][fm][sd]$/, // spouse's siblings
];

/** Which side of the family a path runs through: मावली (via mother's parents), ससुराली (via spouse), else blood. */
function sideOf(path: string): "" | " (मावली)" | " (ससुराली)" {
  if (/^m[fm]/.test(path)) return " (मावली)";
  if (/^[hw]/.test(path) && path.length > 1 && !/^[hw][sd]/.test(path)) return " (ससुराली)";
  return "";
}

// uncle/aunt words that get a birth-order prefix: माइलो काका, कान्छो मामा, जेठी फुपू
const ORDERED = new Set(["काका", "मामा", "फुपू"]);

function run(net: Net, anchorId: string): Kin {
  const sc: SpouseCount = (p) => net.spouses[p.id]?.length || 0;
  const R: Record<string, string> = {};
  const paths: Record<string, string> = {};
  const C = new Set<string>();
  const found = search(net, anchorId);
  const base: Record<string, string> = {};
  Object.keys(found).forEach((id) => {
    if (id === VIRTUAL_ME) return;
    const { path, nodes } = found[id];
    paths[id] = path;
    const term = termForPath(path, nodes.map((n) => net.byId[n]), sc);
    if (term) base[id] = term;
    if (CORE.some((r) => r.test(path)) || path === "") C.add(id);
  });
  // the same word on different sides (हजुरबुबा, बहिनी …) → tell the sides apart
  const sides: Record<string, Set<string>> = {};
  Object.keys(base).forEach((id) => (sides[base[id]] ||= new Set()).add(sideOf(paths[id])));
  Object.keys(base).forEach((id) => {
    let t = base[id];
    if (ORDERED.has(t)) {
      const w = ordinalIn(net, net.byId[id]);
      if (w && !(t === "काका" && w.startsWith("जेठ"))) t = `${w} ${t}`;
    }
    const sd = sideOf(paths[id]);
    R[id] = sd && sides[base[id]].size > 1 ? t + sd : t;
  });
  return { R, paths, C, anchorId };
}

/** Terms for everyone, from the signed-in user's point of view (custom anchor → position → parent). */
export function kinFor(
  people: VPerson[],
  me: (Pick<VProfile, "position_person_id" | "position_parent_id"> & { custom_anchor?: CustomAnchor | null }) | null
): Kin {
  if (!me) return { R: {}, paths: {}, C: new Set(), anchorId: null };
  const { people: list, anchorId } = withAnchor(people, me);
  if (!anchorId) return { R: {}, paths: {}, C: new Set(), anchorId: null };
  return run(buildNet(list), anchorId);
}

/** Terms for everyone from the point of view of a given person. */
export function kinFrom(people: VPerson[], personId: string): Kin {
  const net = buildNet(people);
  if (!net.byId[personId]) return { R: {}, paths: {}, C: new Set(), anchorId: null };
  return run(net, personId);
}

/** What `toId` is to `fromId`, e.g. kinshipBetween(g, ram, hari) → "बुबा". */
export function kinshipBetween(g: Pick<Graph, "people">, fromId: string, toId: string): string | null {
  return kinFrom(g.people, fromId).R[toId] ?? null;
}

// ---------------------------------------------------------------- ordinals (जेठो, माइलो … कान्छो)

const MIDDLE = ["माइलो", "साइलो", "काइँलो", "राइलो", "ठाइलो", "झाइँलो", "अन्तरे", "जन्तरे", "पानी मन्तरे"];
const MAX_COHORT = MIDDLE.length + 2;
const feminine = (w: string) => (/लो$/.test(w) ? w.replace(/लो$/, "ली") : w);

/** Rank word for position `rank` (1-based) of `total` in a group: जेठो, माइलो … कान्छो. null when no word exists. */
export function ordinalWord(rank: number, total: number, female: boolean): string | null {
  if (total < 2 || total > MAX_COHORT || rank < 1 || rank > total) return null;
  if (rank === 1) return female ? "जेठी" : "जेठो";
  if (rank === total) return female ? "कान्छी" : "कान्छो";
  const w = MIDDLE[rank - 2];
  return female ? feminine(w) : w;
}

export interface Cohort {
  /** Same-gender children of the same father (else mother), oldest first when resolvable. */
  members: VPerson[];
  /** Why the order cannot be named, or null when it can. */
  problem: "तारिख अधुरो" | "तारिख दोहोरिएको" | "धेरै सन्तान" | null;
}

function cohortIn(net: Net, p: VPerson): Cohort | null {
  if (p.gender !== "M" && p.gender !== "F") return null;
  const key = p.father_id ? "father_id" : p.mother_id ? "mother_id" : null;
  if (!key) return null;
  const members = net.people.filter((x) => x.gender === p.gender && x[key] === p[key]);
  if (members.length < 2) return null;
  let problem: Cohort["problem"] = null;
  if (members.length > MAX_COHORT) problem = "धेरै सन्तान";
  else if (members.some((x) => !fullDate(x.birth_bs))) problem = "तारिख अधुरो";
  else if (new Set(members.map((x) => parseInt(na(x.birth_bs!).split("-").join(""), 10))).size !== members.length) problem = "तारिख दोहोरिएको";
  if (!problem) members.sort((a, b) => (olderThan(a, b) ? -1 : 1));
  return { members, problem };
}

function ordinalIn(net: Net, p: VPerson): string | null {
  const c = cohortIn(net, p);
  if (!c || c.problem) return null;
  return ordinalWord(c.members.findIndex((x) => x.id === p.id) + 1, c.members.length, p.gender === "F");
}

/** जेठो / माइलो / … / कान्छो among a person's same-gender siblings. null unless every birth date is complete and distinct. */
export function ordinalOf(g: Pick<Graph, "people">, id: string): string | null {
  const net = buildNet(g.people);
  const p = net.byId[id];
  return p ? ordinalIn(net, p) : null;
}

/** Sibling groups whose birth order cannot be named — for the admin "सम्बन्ध समीक्षा" list. */
export function unresolvedCohorts(g: Pick<Graph, "people">): { parent: VPerson | undefined; gender: "M" | "F"; members: VPerson[]; problem: NonNullable<Cohort["problem"]> }[] {
  const net = buildNet(g.people);
  const seen = new Set<string>();
  const out: ReturnType<typeof unresolvedCohorts> = [];
  net.people.forEach((p) => {
    const c = cohortIn(net, p);
    if (!c?.problem) return;
    const key = String(p.father_id || p.mother_id) + p.gender;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ parent: net.byId[(p.father_id || p.mother_id)!], gender: p.gender as "M" | "F", members: c.members, problem: c.problem });
  });
  return out;
}
