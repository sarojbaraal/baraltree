// Change-request building and validation (ported from the original app.js: form submit / send / desc).
import type { ChangeRequest, NewRequest, RequestAction, VPerson, VProfile } from "./types";
import type { Perms } from "./graph";
import { DATE_RE, FIELDS, LABEL, XL, surnameOf, wifeNames } from "./text";

export const STATUS: Record<string, string> = { pending: "पर्खाइमा", approved: "स्वीकृत", rejected: "अस्वीकृत" };
export const ACT: Record<string, string> = { add: "थप्ने", update: "सच्याउने", delete: "हटाउने" };

export const GOT = (isAdm: boolean) => (isAdm ? "सुरक्षित गर्ने" : "अनुरोध पठाउने");

/** Values collected by the person form, keyed by FIELDS. */
export type FormValues = Record<string, string | boolean>;

export interface FormInput {
  action: "add" | "update";
  person: VPerson | null;
  values: FormValues;
  married: boolean;
  facebook?: string; // only present when editing
  photoUrl?: string; // set when a new profile photo was uploaded
}

export interface BuildResult {
  error?: string;
  payload?: Record<string, unknown>;
  facebookChanged?: boolean;
  facebook?: string;
}

/** Normalizes form values and returns the payload to send (only changed fields for updates). */
export function buildPersonPayload(inp: FormInput, fbOkFn: (u: string) => boolean): BuildResult {
  const { action, person: p, married } = inp;
  const cur: Record<string, unknown> = {};
  FIELDS.forEach((k) => {
    const v = inp.values[k];
    cur[k] = k === "is_living" ? v === true || v === "true" : String(v ?? "").trim();
  });
  if (inp.photoUrl) cur.photo_url = inp.photoUrl;
  const fb = (inp.facebook ?? "").trim();
  const fbChg = inp.facebook !== undefined && fb !== (p?.facebook || "");

  if (cur.gender === "M" && cur.spouse_name) {
    const r = wifeNames(String(cur.spouse_name), "", "", surnameOf(String(cur.name)));
    if (r) cur.spouse_name = r.name;
  }
  if (cur.is_living) cur.death_bs = "";
  if (cur.gender !== "F") {
    cur.maiden_name = "";
    cur.married_name = "";
  }
  if (!married) {
    cur.maiden_name = "";
    cur.married_name = "";
    cur.spouse_id = p?.spouse_id || "";
    cur.spouse_name = "";
  }
  for (const k of ["birth_bs", "death_bs"]) {
    // Dates already stored in another shape (e.g. year only) are accepted until the user edits them.
    const unchanged = !!p && String(cur[k]) === String((p as unknown as Record<string, unknown>)[k] ?? "");
    if (cur[k] && !unchanged && !DATE_RE.test(String(cur[k]))) return { error: "मिति YYYY-MM-DD ढाँचामा हुनुपर्छ (साल ४ अंक)।" };
  }
  if (!cur.name) return { error: "नाम अनिवार्य छ।" };

  let payload: Record<string, unknown> = cur;
  if (action === "update" && p) {
    payload = {};
    FIELDS.forEach((k) => {
      const old = (p as unknown as Record<string, unknown>)[k] ?? (k === "is_living" ? true : "");
      if (String(cur[k]) !== String(old)) payload[k] = cur[k];
    });
    if (inp.photoUrl) payload.photo_url = inp.photoUrl;
    if (!Object.keys(payload).length && !fbChg) return { error: "कुनै परिवर्तन गरिएको छैन।" };
  }
  if (fbChg && fb && !fbOkFn(fb)) return { error: "Facebook लिंक https://facebook.com/... जस्तो हुनुपर्छ।" };
  return { payload, facebookChanged: fbChg, facebook: fb };
}

/** Permission check applied before a non-staff user submits a request. Returns an error message or null. */
export function guardRequest(
  perms: Perms,
  action: RequestAction,
  personId: string | null,
  payload: Record<string, unknown>
): string | null {
  if (perms.isStaff) return null;
  if (perms.act !== "premium") return "तपाईंको भूमिकाले परिवर्तन अनुरोध पठाउन मिल्दैन।";
  if (personId && !perms.canEdit(personId)) return "यो व्यक्ति तपाईंको सम्पादन क्षेत्रमा हुनुहुन्न।";
  if (action === "add" && !["father_id", "mother_id", "spouse_id"].some((k) => payload[k] && perms.canEdit(String(payload[k]))))
    return "आफ्नो क्षेत्रभित्रको बुबा/आमा/जोडी छान्नुहोस्।";
  if (payload.add_spouse_id && !perms.canEdit(String(payload.add_spouse_id))) return "यो व्यक्ति तपाईंको सम्पादन क्षेत्रमा हुनुहुन्न।";
  return null;
}

export function makeRequest(
  me: VProfile,
  action: RequestAction,
  personId: string | null,
  payload: Record<string, unknown>,
  note: string
): NewRequest {
  return { requested_by: me.id, action, person_id: personId, payload, note: note || null };
}

export interface KidDraft {
  name: string;
  gender: string;
  is_living: boolean;
  birth_bs: string;
  birth_place: string;
  married: boolean;
  spouse: string;
}

/** Builds one add-request per child, sharing a batch id so the admin sees them together. */
export function buildKidRequests(
  me: VProfile,
  parent: VPerson,
  other: string,
  kids: KidDraft[],
  note: string,
  spouseCount: number
): { error?: string; requests?: NewRequest[] } {
  let bad = "";
  const list = kids
    .map((c) => {
      if (c.birth_bs && !DATE_RE.test(c.birth_bs)) bad = "मिति YYYY-MM-DD ढाँचामा हुनुपर्छ (साल ४ अंक)।";
      const k: Record<string, unknown> = { name: c.name.trim(), gender: c.gender, is_living: c.is_living };
      if (c.birth_bs) k.birth_bs = c.birth_bs;
      if (c.birth_place.trim()) k.birth_place = c.birth_place.trim();
      const sn = c.spouse.trim();
      if (c.married && sn) {
        k.spouse_name = sn;
        if (c.gender === "F") {
          const r = wifeNames(String(k.name), "", "", surnameOf(sn));
          if (r) Object.assign(k, r);
        } else if (c.gender === "M") {
          const r = wifeNames(sn, "", "", surnameOf(String(k.name)));
          if (r) k.spouse_name = r.name;
        }
      }
      return k;
    })
    .filter((k) => k.name);
  if (bad) return { error: bad };
  if (!list.length) return { error: "कम्तिमा एउटा नाम लेख्नुहोस्।" };
  if (spouseCount > 1 && !other) return { error: "कुन पति/पत्नीको सन्तान हो, अर्को अभिभावक छान्नुहोस्।" };
  const batch = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const par = parent.gender === "F" ? { mother_id: parent.id, father_id: other } : { father_id: parent.id, mother_id: other };
  return {
    requests: list.map((k) => ({
      requested_by: me.id,
      action: "add" as const,
      person_id: null,
      note: note || null,
      payload: { ...k, ...par, batch },
    })),
  };
}

/** Human-readable lines for a change request. */
export function describeRequest(
  r: ChangeRequest,
  byId: Record<string, VPerson>
): { action: string; who: string; lines: string[]; note: string | null } {
  const who = r.person_id && byId[r.person_id] ? byId[r.person_id].name : "";
  const lines = Object.entries(r.payload || {})
    .filter(([k]) => k !== "batch")
    .map(([k, v]) => {
      const val = k.endsWith("_id") ? byId[String(v)]?.name || "—" : v === true ? "हो" : v === false ? "होइन" : (v as string) || "—";
      return `${LABEL[k] || XL[k] || k}: ${val}`;
    });
  return { action: ACT[r.action] || r.action, who, lines, note: r.note };
}

/** Groups pending requests that were submitted together (same batch id). */
export function groupBatches(reqs: ChangeRequest[]): { batch?: string; items: ChangeRequest[] }[] {
  const groups: { batch?: string; items: ChangeRequest[] }[] = [];
  reqs.forEach((r) => {
    const b = (r.payload as { batch?: string } | null)?.batch;
    let g = b ? groups.find((x) => x.batch === b) : undefined;
    if (!g) {
      g = { batch: b, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  });
  return groups;
}
