// Family graph queries over the people list (ported from the original app.js).
import type { VPerson, VProfile, Role } from "./types";

export type Graph = ReturnType<typeof createGraph>;

export const ROLE_L: Record<Role, string> = {
  general: "सामान्य सदस्य",
  premium: "प्रिमियम सदस्य",
  moderator: "मोडरेटर",
  admin: "एडमिन",
};
export const ORDER: Role[] = ["admin", "moderator", "premium", "general"];

export function createGraph(people: VPerson[]) {
  const byId: Record<string, VPerson> = Object.fromEntries(people.map((p) => [p.id, p]));

  const hasParents = (p: VPerson) => !!(p.father_id || p.mother_id);
  const spouseIds = (p: VPerson): string[] =>
    [p.spouse_id, ...(p.more_spouse_ids || [])].filter((id): id is string => !!id && !!byId[id]);
  const spousesOf = spouseIds;

  const byBirth = (a: VPerson, b: VPerson) =>
    (a.birth_bs || "9999").localeCompare(b.birth_bs || "9999") || String(a.created_at).localeCompare(String(b.created_at));

  /** Children of p; when p and their single spouse are mutual single spouses, the spouse's children too. */
  const kidsOf = (p: VPerson): VPerson[] => {
    const sp = spousesOf(p);
    const s = sp.length === 1 ? byId[sp[0]] : null;
    const both = !!s && spousesOf(s).length === 1 && spousesOf(s)[0] === p.id;
    return people.filter(
      (c) =>
        c.father_id === p.id ||
        c.mother_id === p.id ||
        (both && s && (c.father_id === s.id || c.mother_id === s.id))
    );
  };

  const addrOf = (p: VPerson): string =>
    p.address || (spousesOf(p).length === 1 ? byId[spousesOf(p)[0]]?.address : "") || "";

  const isMarriedIn = (p: VPerson): boolean => {
    const s = p.spouse_id ? byId[p.spouse_id] : undefined;
    if (!s || p.more_spouse_ids?.length) return false;
    return !!(hasParents(s) || s.more_spouse_ids?.length || s.id < p.id);
  };

  const sibsOf = (x: VPerson): VPerson[] =>
    people.filter(
      (y) =>
        y.id !== x.id &&
        ((x.father_id && y.father_id === x.father_id) || (x.mother_id && y.mother_id === x.mother_id))
    );

  /** Everyone connected to ids by ancestry/descent (with spouses). */
  const branchOf = (ids: string[]): Set<string> => {
    const S = new Set<string>();
    const addSp = (p: VPerson) => spousesOf(p).forEach((s) => S.add(s));
    const up = (id?: string | null) => {
      const p = id ? byId[id] : undefined;
      if (!p || S.has(p.id)) return;
      S.add(p.id);
      addSp(p);
      up(p.father_id);
      up(p.mother_id);
    };
    const down = (id: string) =>
      people
        .filter((c) => c.father_id === id || c.mother_id === id)
        .forEach((c) => {
          if (!S.has(c.id)) {
            S.add(c.id);
            addSp(c);
            down(c.id);
          }
        });
    ids.forEach((id) => {
      up(id);
      down(id);
      const p = byId[id];
      if (p) spousesOf(p).forEach(down);
    });
    return S;
  };

  /** id, their spouses and all descendants (with spouses). */
  const downSet = (id: string, S: Set<string> = new Set()): Set<string> => {
    const p = byId[id];
    if (!p || S.has(id)) return S;
    S.add(id);
    spousesOf(p).forEach((x) => S.add(x));
    people.filter((c) => c.father_id === id || c.mother_id === id).forEach((c) => downSet(c.id, S));
    return S;
  };

  /** Ancestors of id with generation distance (id itself = 0). */
  const ancUp = (id: string): Record<string, number> => {
    const M: Record<string, number> = { [id]: 0 };
    const q = [id];
    while (q.length) {
      const x = q.shift() as string;
      const p = byId[x];
      [p?.father_id, p?.mother_id].forEach((a) => {
        if (a && byId[a] && M[a] === undefined) {
          M[a] = M[x] + 1;
          q.push(a);
        }
      });
    }
    return M;
  };

  return {
    people,
    byId,
    hasParents,
    spousesOf,
    byBirth,
    kidsOf,
    addrOf,
    isMarriedIn,
    sibsOf,
    branchOf,
    downSet,
    ancUp,
  };
}

// ---------------- roles & access ----------------

/** All roles the profile may act as, ordered from most to least privileged. */
export function myRoles(me: VProfile | null): Role[] {
  const r = new Set<string>(me?.roles || []);
  if (me?.role === "admin") ORDER.forEach((x) => r.add(x));
  else if (me?.role === "member" && !r.size) r.add("general");
  return ORDER.filter((x) => r.has(x));
}

export const hasPos = (u?: VProfile | null) =>
  !!(u?.position_person_id || u?.position_parent_id || u?.position_grand_id);
export const hasClaim = (u?: VProfile | null) => !!(u?.claim_father || u?.claim_grand);
export const myPos = (me?: VProfile | null): string | null =>
  me?.position_person_id || me?.position_parent_id || me?.position_grand_id || null;

/** The grandfather whose lineage a premium member may edit. */
export function premiumGrand(g: Graph, me: VProfile): VPerson | null {
  const { byId } = g;
  const m = me.position_person_id ? byId[me.position_person_id] : undefined;
  const pa = me.position_parent_id ? byId[me.position_parent_id] : undefined;
  const gr = me.position_grand_id ? byId[me.position_grand_id] : undefined;
  const f = m
    ? m.father_id ? byId[m.father_id] : undefined
    : pa
    ? pa.gender === "F" ? (pa.spouse_id ? byId[pa.spouse_id] : undefined) : pa
    : undefined;
  return gr || (f?.father_id ? byId[f.father_id] : undefined) || f || null;
}

export interface Access {
  /** Visible (unlocked) people; null = everything visible. */
  acc: Set<string> | null;
  /** People a premium member may edit; null for other roles. */
  edits: Set<string> | null;
}

export function computeAccess(g: Graph, me: VProfile | null, act: Role | null): Access {
  let acc: Set<string> | null = null;
  let edits: Set<string> | null = null;
  if (!me) return { acc, edits };
  if (g.people.some((p) => p.is_locked)) acc = new Set(g.people.filter((p) => !p.is_locked).map((p) => p.id));
  if (act === "premium") {
    const gr = premiumGrand(g, me);
    edits = gr ? g.downSet(gr.id) : new Set();
  }
  return { acc, edits };
}

export interface Perms {
  act: Role | null;
  isAdm: boolean;
  isStaff: boolean;
  seesAll: boolean;
  can: (id: string) => boolean;
  canEdit: (id: string) => boolean;
  nm: (p: VPerson) => string;
}

export function makePerms(act: Role | null, access: Access): Perms {
  const isAdm = act === "admin";
  const isStaff = act === "admin" || act === "moderator";
  const can = (id: string) => !access.acc || access.acc.has(id);
  return {
    act,
    isAdm,
    isStaff,
    seesAll: act !== "general",
    can,
    canEdit: (id) => isStaff || (act === "premium" && !!access.edits && access.edits.has(id)),
    nm: (p) => (can(p.id) ? p.name : "••••••"),
  };
}
