// Offline support: a copy of the last data the server sent (so the app opens without a connection) and an outbox of
// changes made while offline (sent automatically when the connection returns).
import type { NewRequest, Role, VPerson, VProfile } from "./types";

// ---- tiny IndexedDB key/value store ----
const DB = "vansh-offline";
const ST = "kv";
let dbp: Promise<IDBDatabase> | null = null;
const open = () =>
  (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((res, rej) => {
    const r = f(d.transaction(ST, mode).objectStore(ST));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export const kvGet = async <T>(k: string): Promise<T | undefined> => {
  try {
    return await tx<T | undefined>("readonly", (s) => s.get(k) as IDBRequest<T | undefined>);
  } catch {
    return undefined;
  }
};
export const kvSet = async (k: string, v: unknown) => {
  try {
    await tx("readwrite", (s) => s.put(v, k));
  } catch {
    /* storage unavailable (private window): the app simply works online-only */
  }
};
export const kvDel = async (k: string) => {
  try {
    await tx("readwrite", (s) => s.delete(k));
  } catch {
    /* ignore */
  }
};

// ---- snapshot of server data ----
export interface Snapshot {
  userId: string;
  me: VProfile | null;
  act: Role | null;
  peopleByRole: Record<string, VPerson[]>;
  savedAt: number;
}
export const loadSnapshot = () => kvGet<Snapshot>("snapshot");
export const saveSnapshot = (s: Snapshot) => kvSet("snapshot", s);
export const clearSnapshot = () => kvDel("snapshot");

// ---- outbox ----
export interface OutboxItem {
  id: string;
  userId: string;
  rows: NewRequest[];
  okMsg: string;
  /** admin: the requests are approved right after they are inserted */
  admin: boolean;
  /** profile photo to upload first; its public URL goes into rows[0].payload.photo_url */
  photo?: { blob: Blob; name: string };
  /** local ids (tmp-…) created by this item, in the order the rows will create people */
  tmp?: string[];
  ts: number;
  /** set when the server rejected the item (it is kept so the user can see it) */
  error?: string;
}
export const loadOutbox = async () => (await kvGet<OutboxItem[]>("outbox")) ?? [];
export const saveOutbox = (o: OutboxItem[]) => kvSet("outbox", o);

/** True for failures caused by the connection rather than by the data. */
export const isNetErr = (msg: string | undefined | null) =>
  (typeof navigator !== "undefined" && navigator.onLine === false) || /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|ERR_INTERNET/i.test(msg || "");

// ---- local (optimistic) effect of queued changes ----
const tmpId = () => "tmp-" + Math.random().toString(36).slice(2, 10);
const blank = (id: string, name: string): VPerson => ({ id, name, gender: null, father_id: null, mother_id: null, spouse_id: null, more_spouse_ids: [], is_living: true, created_at: new Date().toISOString() });

/** Applies change requests to a people list the way an admin's approval would. Returns the new list and the ids created. */
export function applyLocal(people: VPerson[], rows: NewRequest[], photoUrl?: string): { people: VPerson[]; created: string[] } {
  let list = people.map((p) => ({ ...p }));
  const created: string[] = [];
  const byId = () => Object.fromEntries(list.map((p) => [p.id, p]));
  for (const r of rows) {
    const pl = { ...(r.payload || {}) } as Record<string, unknown>;
    if (photoUrl && r === rows[0]) pl.photo_url = photoUrl;
    if (r.action === "delete") {
      if (r.person_id) list = list.filter((p) => p.id !== r.person_id).map((p) => ({ ...p, father_id: p.father_id === r.person_id ? null : p.father_id, mother_id: p.mother_id === r.person_id ? null : p.mother_id, spouse_id: p.spouse_id === r.person_id ? null : p.spouse_id }));
      continue;
    }
    const FIELDS = ["name", "gender", "father_id", "mother_id", "spouse_id", "is_living", "birth_bs", "death_bs", "phone", "address", "notes", "maiden_name", "married_name", "birth_place", "death_place", "education", "occupation", "marriage_bs", "photo_url", "facebook"];
    const pick = () => Object.fromEntries(Object.entries(pl).filter(([k, v]) => FIELDS.includes(k) && !(k.endsWith("_id") && v === "")).map(([k, v]) => [k, v === "" ? null : v]));
    let target: VPerson;
    if (r.action === "add") {
      target = { ...blank(tmpId(), String(pl.name || "—")), ...(pick() as Partial<VPerson>) };
      created.push(target.id);
      list.push(target);
    } else {
      const t = byId()[r.person_id || ""];
      if (!t) continue;
      Object.assign(t, pick());
      target = t;
    }
    // spouse typed as a new name: a placeholder person is linked
    const sname = String(pl.spouse_name || "").trim();
    if (sname && !target.spouse_id) {
      const sp = { ...blank(tmpId(), sname), gender: target.gender === "F" ? "M" : "F", spouse_id: target.id };
      created.push(sp.id);
      list.push(sp);
      target.spouse_id = sp.id;
    }
    // a parent typed as a new name
    for (const [nk, ik, g] of [["father_name", "father_id", "M"], ["mother_name", "mother_id", "F"]] as const) {
      const n = String(pl[nk] || "").trim();
      if (n && !target[ik]) {
        const pp = { ...blank(tmpId(), n), gender: g };
        created.push(pp.id);
        list.push(pp);
        target[ik] = pp.id;
      }
    }
    if (target.spouse_id) {
      const sp = byId()[target.spouse_id] ?? list.find((p) => p.id === target.spouse_id);
      if (sp && !sp.spouse_id) sp.spouse_id = target.id;
    }
  }
  return { people: list, created };
}

/** Replaces local ids with the real ones once the server has created the people. */
export function remapIds(rows: NewRequest[], map: Record<string, string>): NewRequest[] {
  if (!Object.keys(map).length) return rows;
  return rows.map((r) => ({
    ...r,
    person_id: r.person_id ? map[r.person_id] ?? r.person_id : null,
    payload: Object.fromEntries(Object.entries(r.payload || {}).map(([k, v]) => [k, typeof v === "string" && map[v] ? map[v] : v])),
  }));
}
