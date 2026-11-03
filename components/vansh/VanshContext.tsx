"use client";
// App state for the Vansavali UI: session, profile, active role, people, tab, selection, dialogs, toast.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import type { ChangeRequest, NewRequest, RequestAction, TabKey, VPerson, VProfile, Role } from "@/lib/vansh/types";
import {
  computeAccess, createGraph, hasClaim, hasPos, makePerms, myPos, myRoles,
  type Access, type Graph, type Perms,
} from "@/lib/vansh/graph";
import { guardRequest, makeRequest } from "@/lib/vansh/requests";
import { loadSiteAvatars, primeSiteAvatars } from "@/lib/vansh/avatars";
import { initDeepLinks } from "@/lib/vansh/native";
import { applyLocal, clearSnapshot, isNetErr, loadOutbox, loadSnapshot, remapIds, saveOutbox, saveSnapshot, type OutboxItem, type Snapshot } from "@/lib/vansh/offline";

const dataUrl = (b: Blob) => new Promise<string>((res) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => res(""); f.readAsDataURL(b); });

export type Phase = "loading" | "auth" | "reset" | "pos" | "pending" | "app";

export interface TreeApi {
  /** Unfold a person's branch and glide the chart to them. */
  reveal: (id: string) => void;
  /** Tree depth (0 = root generation) of a laid-out person. */
  depthOf: (id: string) => number | undefined;
  /** Open the print window for a person's branch. */
  print: (id: string) => void;
}

interface DialogState {
  node: React.ReactNode;
  ed: boolean;
}

export interface Vansh {
  db: SupabaseClient;
  phase: Phase;
  me: VProfile | null;
  act: Role | null;
  setAct: (r: Role) => void;
  roles: Role[];
  people: VPerson[];
  g: Graph;
  access: Access;
  perms: Perms;
  tab: TabKey;
  setTab: (t: TabKey) => void;
  sel: string | null;
  pick: (id: string, opts?: { fromTree?: boolean }) => void;
  unpick: () => void;
  toast: (m: string) => void;
  toastMsg: string;
  reload: () => Promise<void>;
  boot: () => Promise<void>;
  openDialog: (node: React.ReactNode, ed?: boolean) => void;
  closeDialog: () => void;
  dialog: DialogState | null;
  /** Insert change requests; admins have them approved immediately. Returns an error message or null. */
  submit: (rows: NewRequest[], okMsg: string, opts?: { photo?: { blob: Blob; name: string } }) => Promise<string | null>;
  /** false while the device has no connection */
  online: boolean;
  /** changes made offline that are waiting to be sent (items with `error` were refused by the server) */
  outbox: OutboxItem[];
  syncNow: () => Promise<void>;
  discardOutbox: (id: string) => void;
  /** Build + submit one request after role checks. Returns an error message or null. */
  send: (action: RequestAction, personId: string | null, payload: Record<string, unknown>, note: string, opts?: { photo?: { blob: Blob; name: string } }) => Promise<string | null>;
  treeApi: React.MutableRefObject<TreeApi | null>;
  setRecovering: (v: boolean) => void;
  myPosId: string | null;
  invite: () => string | null;
  clearInvite: () => void;
}

const Ctx = createContext<Vansh | null>(null);
export const useVansh = (): Vansh => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVansh outside provider");
  return v;
};

const invTok = (): string | null => {
  try {
    return localStorage.getItem("vv_invite");
  } catch {
    return null;
  }
};

export function VanshProvider({ children }: { children: React.ReactNode }) {
  const db = useMemo(() => createClient(), []);
  const [phase, setPhase] = useState<Phase>("loading");
  const [me, setMe] = useState<VProfile | null>(null);
  const [act, setActState] = useState<Role | null>(null);
  const [people, setPeople] = useState<VPerson[]>([]);
  const [tab, setTabState] = useState<TabKey>("fam");
  const [sel, setSel] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const treeApi = useRef<TreeApi | null>(null);
  const recovering = useRef(false);
  const bootSeq = useRef(0);
  const userId = useRef<string | null>(null);
  const actRef = useRef<Role | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const peopleRef = useRef<VPerson[]>([]);
  const meRef = useRef<VProfile | null>(null);
  const snap = useRef<Snapshot | null>(null);
  const syncing = useRef(false);

  useEffect(() => { peopleRef.current = people; }, [people]);
  useEffect(() => { meRef.current = me; }, [me]);
  const roles = useMemo(() => myRoles(me), [me]);
  const g = useMemo(() => createGraph(people), [people]);
  const access = useMemo(() => computeAccess(g, me, act), [g, me, act]);
  const perms = useMemo(() => makePerms(act, access), [act, access]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const remember = useCallback((role: Role | null, list: VPerson[]) => {
    const uid = userId.current;
    if (!uid) return;
    const prev = snap.current && snap.current.userId === uid ? snap.current : null;
    snap.current = { userId: uid, me: meRef.current, act: role, peopleByRole: { ...(prev?.peopleByRole || {}), [role ?? "none"]: list }, savedAt: Date.now() };
    saveSnapshot(snap.current);
  }, []);

  const loadPeople = useCallback(
    async (role: Role | null) => {
      const { data, error } = await db.rpc("get_people", { p_role: role });
      if (error) {
        if (isNetErr(error.message)) {
          // no connection: show the last copy we received for this role
          const old = snap.current?.peopleByRole[role ?? "none"];
          if (old) setPeople(old);
          setOnline(false);
          return;
        }
        alert(error.message);
        return;
      }
      setOnline(true);
      setPeople((data as VPerson[]) || []);
      remember(role, (data as VPerson[]) || []);
    },
    [db, remember]
  );

  const reload = useCallback(async () => {
    await loadPeople(actRef.current);
  }, [loadPeople]);

  const boot = useCallback(async () => {
    const seq = ++bootSeq.current;
    const stale = () => seq !== bootSeq.current;
    const {
      data: { session },
    } = await db.auth.getSession();
    if (stale()) return;
    const useSnap = (sn: Snapshot) => {
      userId.current = sn.userId;
      snap.current = sn;
      setMe(sn.me);
      actRef.current = sn.act;
      setActState(sn.act);
      setPeople(sn.peopleByRole[sn.act ?? "none"] || []);
      setOnline(false);
      setPhase("app");
    };
    if (!session) {
      // offline with an expired token: the stored copy still opens (read + queue changes)
      const sn = await loadSnapshot();
      if (stale()) return;
      if (sn && (navigator.onLine === false)) return useSnap(sn);
      userId.current = null;
      setMe(null);
      setPeople([]);
      setPhase("auth");
      return;
    }
    userId.current = session.user.id;
    if (recovering.current || session.user.user_metadata?.must_change_password) {
      setPhase("reset");
      return;
    }
    let { data, error: pe } = await db.from("profiles").select("*").eq("id", session.user.id).single();
    if (stale()) return;
    if (pe && isNetErr(pe.message)) {
      const sn = await loadSnapshot();
      if (stale()) return;
      if (sn && sn.userId === session.user.id) return useSnap(sn);
    }
    let profile = data as VProfile | null;
    const md = session.user.user_metadata || {};
    const inv = invTok() || md.invite;
    if (profile && inv) {
      const { data: whoName, error: ie } = await db.rpc("claim_invite", { p_token: inv });
      try {
        localStorage.removeItem("vv_invite");
      } catch {}
      if (md.invite) db.auth.updateUser({ data: { invite: null } });
      if (ie) toast("निम्तो: " + ie.message);
      else {
        ({ data } = await db.from("profiles").select("*").eq("id", session.user.id).single());
        profile = (data as VProfile | null) || profile;
        toast("✅ तपाईंको खाता " + whoName + " को प्रोफाइलसँग जोडियो");
      }
      if (stale()) return;
    }
    setMe(profile);
    const rs = myRoles(profile);
    let chosen: Role | null = null;
    if (rs.length) {
      let s: string | null = null;
      try {
        s = localStorage.getItem("vv_role");
      } catch {}
      chosen = rs.includes(s as Role) ? (s as Role) : rs[0];
    }
    actRef.current = chosen;
    setActState(chosen);
    if (profile && !rs.length && !hasPos(profile) && !hasClaim(profile)) return setPhase("pos");
    if (!profile || !rs.length) return setPhase("pending");
    const sn0 = await loadSnapshot();
    snap.current = sn0 && sn0.userId === session.user.id ? sn0 : null;
    meRef.current = profile;
    await loadPeople(chosen);
    if (stale()) return;
    setPhase("app");
  }, [db, loadPeople, toast]);

  // auth events
  useEffect(() => {
    primeSiteAvatars();
    loadSiteAvatars(db);
  }, [db]);

  useEffect(() => {
    // an invitation link (?invite=token) is remembered, then removed from the address bar
    try {
      const t = new URLSearchParams(location.search).get("invite");
      if (t) {
        localStorage.setItem("vv_invite", t);
        history.replaceState(null, "", location.pathname);
      }
    } catch {}
    let stopLinks = () => {};
    initDeepLinks(db, () => setTimeout(boot, 0)).then((f) => (stopLinks = f)).catch(() => {});
    const onRecovery = () => { recovering.current = true; };
    window.addEventListener("vv-recovery", onRecovery);
    const { data: sub } = db.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") recovering.current = true;
      if (ev === "TOKEN_REFRESHED") return;
      if (ev === "SIGNED_OUT") { snap.current = null; clearSnapshot(); }
      // SIGNED_IN also fires when the tab regains focus; only re-boot if the user changed
      if (ev === "SIGNED_IN" && session?.user.id === userId.current) return;
      setTimeout(boot, 0);
    });
    return () => { sub.subscription.unsubscribe(); stopLinks(); window.removeEventListener("vv-recovery", onRecovery); };
  }, [db, boot]);

  const setAct = useCallback(
    (r: Role) => {
      actRef.current = r;
      setActState(r);
      try {
        localStorage.setItem("vv_role", r);
      } catch {}
      if ((r === "general" || r === "premium") && tab === "admin") setTabState("fam");
      loadPeople(r);
    },
    [loadPeople, tab]
  );

  const setTab = useCallback((t: TabKey) => {
    setTabState(t);
    setSel(null);
  }, []);

  const pick = useCallback(
    (id: string) => {
      if (!perms.can(id)) {
        toast("🔒 यो शाखा तपाईंको पहुँचमा छैन");
        return;
      }
      setSel(id);
    },
    [perms, toast]
  );
  const unpick = useCallback(() => setSel(null), []);

  const openDialog = useCallback((node: React.ReactNode, ed = false) => setDialog({ node, ed }), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const syncRef = useRef<() => Promise<void>>(async () => {});

  const queue = useCallback(
    async (rows: NewRequest[], okMsg: string, photo?: { blob: Blob; name: string }) => {
      const uid = userId.current;
      if (!uid) return "लगइन आवश्यक छ।";
      let created: string[] = [];
      if (perms.isAdm) {
        // an admin's change shows immediately; it is sent and approved when the connection returns
        const r = applyLocal(peopleRef.current, rows, photo ? await dataUrl(photo.blob) : undefined);
        created = r.created;
        setPeople(r.people);
        remember(actRef.current, r.people);
      }
      const item: OutboxItem = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), userId: uid, rows, okMsg, admin: perms.isAdm, photo, tmp: created, ts: Date.now() };
      const all = [...(await loadOutbox()), item];
      await saveOutbox(all);
      setOutbox(all.filter((i) => i.userId === uid));
      toast(perms.isAdm ? "📴 ऑफलाइन — सुरक्षित भयो; इन्टरनेट आएपछि आफैँ सर्भरमा जान्छ" : "📴 ऑफलाइन — अनुरोध सुरक्षित भयो; इन्टरनेट आएपछि आफैँ पठाइनेछ");
      return null;
    },
    [perms.isAdm, remember, toast]
  );

  const submit = useCallback(
    async (rows: NewRequest[], okMsg: string, opts?: { photo?: { blob: Blob; name: string } }): Promise<string | null> => {
      if (navigator.onLine === false) return queue(rows, okMsg, opts?.photo);
      const { data, error } = await db.from("change_requests").insert(rows).select("id");
      if (error) return isNetErr(error.message) ? queue(rows, okMsg, opts?.photo) : error.message;
      if (perms.isAdm) {
        for (const r of (data as { id: string }[]) || []) {
          const { error: e } = await db.rpc("review_request", { req: r.id, approve: true });
          if (e) return "अनुरोध बन्यो तर लागू हुन सकेन: " + e.message;
        }
        toast("✅ सुरक्षित भयो");
        await reload();
        return null;
      }
      toast(okMsg);
      return null;
    },
    [db, perms.isAdm, queue, reload, toast]
  );

  /** Sends queued changes in order; stops at the first connection failure. */
  const syncNow = useCallback(async () => {
    const uid = userId.current;
    if (syncing.current || !uid || navigator.onLine === false) return;
    syncing.current = true;
    try {
      let all = await loadOutbox();
      const mine = all.filter((i) => i.userId === uid && !i.error);
      if (!mine.length) { setOutbox(all.filter((i) => i.userId === uid)); return; }
      const map: Record<string, string> = {};
      let sent = 0;
      for (const item of mine) {
        const rows = remapIds(item.rows, map).map((r) => ({ ...r, payload: { ...r.payload } }));
        if (item.photo) {
          const { error: ue } = await db.storage.from("profile-photos").upload(item.photo.name, item.photo.blob, { contentType: item.photo.blob.type || undefined });
          if (ue) {
            if (isNetErr(ue.message)) break;
            item.error = "फोटो अपलोड असफल: " + ue.message;
            continue;
          }
          if (rows[0]) rows[0].payload.photo_url = db.storage.from("profile-photos").getPublicUrl(item.photo.name).data.publicUrl;
        }
        const known = new Set(peopleRef.current.filter((p) => !p.id.startsWith("tmp-")).map((p) => p.id));
        const { data, error } = await db.from("change_requests").insert(rows).select("id");
        if (error) {
          if (isNetErr(error.message)) break;
          item.error = error.message;
          continue;
        }
        let failed = "";
        if (item.admin) {
          for (const r of (data as { id: string }[]) || []) {
            const { error: e } = await db.rpc("review_request", { req: r.id, approve: true });
            if (e) { failed = "अनुरोध बन्यो तर लागू हुन सकेन: " + e.message; break; }
          }
        }
        if (failed) { item.error = failed; continue; }
        all = all.filter((i) => i.id !== item.id);
        sent++;
        if (item.admin && item.tmp?.length) {
          // learn the real ids of people created locally so later queued changes can refer to them
          const { data: fresh } = await db.rpc("get_people", { p_role: actRef.current });
          const used = new Set<string>();
          for (const t of item.tmp) {
            const local = peopleRef.current.find((p) => p.id === t);
            const hit = ((fresh as VPerson[]) || []).find((p) => !known.has(p.id) && !used.has(p.id) && local && p.name === local.name);
            if (hit) { map[t] = hit.id; used.add(hit.id); }
          }
        }
      }
      await saveOutbox(all);
      setOutbox(all.filter((i) => i.userId === uid));
      if (sent) {
        await reload();
        toast(`✅ ऑफलाइन गरिएका ${sent} परिवर्तन सर्भरमा पठाइयो`);
      }
    } finally {
      syncing.current = false;
    }
  }, [db, reload, toast]);
  syncRef.current = syncNow;

  const discardOutbox = useCallback(async (id: string) => {
    const all = (await loadOutbox()).filter((i) => i.id !== id);
    await saveOutbox(all);
    setOutbox(all.filter((i) => i.userId === userId.current));
  }, []);

  // connection state, and automatic sending when the connection returns
  useEffect(() => {
    setOnline(navigator.onLine !== false);
    const up = () => { setOnline(true); setTimeout(() => syncRef.current(), 600); };
    const down = () => setOnline(false);
    addEventListener("online", up);
    addEventListener("offline", down);
    const iv = setInterval(() => { if (navigator.onLine !== false) syncRef.current(); }, 45000);
    return () => { removeEventListener("online", up); removeEventListener("offline", down); clearInterval(iv); };
  }, []);
  useEffect(() => {
    if (phase !== "app") return;
    loadOutbox().then((all) => { setOutbox(all.filter((i) => i.userId === userId.current)); syncRef.current(); });
  }, [phase]);

  const send = useCallback(
    async (action: RequestAction, personId: string | null, payload: Record<string, unknown>, note: string, opts?: { photo?: { blob: Blob; name: string } }) => {
      if (!me) return "लगइन आवश्यक छ।";
      const bad = guardRequest(perms, action, personId, payload);
      if (bad) return bad;
      return submit([makeRequest(me, action, personId, payload, note)], "✅ अनुरोध पठाइयो — एडमिनको स्वीकृतिपछि देखिनेछ", opts);
    },
    [me, perms, submit]
  );

  const value: Vansh = {
    db, phase, me, act, setAct, roles, people, g, access, perms, tab, setTab, sel, pick, unpick, toast, toastMsg,
    reload, boot, openDialog, closeDialog, dialog, submit, send, treeApi, online, outbox, syncNow, discardOutbox,
    setRecovering: (v) => {
      recovering.current = v;
    },
    myPosId: myPos(me),
    invite: invTok,
    clearInvite: () => {
      try {
        localStorage.removeItem("vv_invite");
      } catch {}
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { ChangeRequest };
