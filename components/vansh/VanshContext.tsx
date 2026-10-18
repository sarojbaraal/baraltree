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
  submit: (rows: NewRequest[], okMsg: string) => Promise<string | null>;
  /** Build + submit one request after role checks. Returns an error message or null. */
  send: (action: RequestAction, personId: string | null, payload: Record<string, unknown>, note: string) => Promise<string | null>;
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

  const roles = useMemo(() => myRoles(me), [me]);
  const g = useMemo(() => createGraph(people), [people]);
  const access = useMemo(() => computeAccess(g, me, act), [g, me, act]);
  const perms = useMemo(() => makePerms(act, access), [act, access]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const loadPeople = useCallback(
    async (role: Role | null) => {
      const { data, error } = await db.rpc("get_people", { p_role: role });
      if (error) {
        alert(error.message);
        return;
      }
      setPeople((data as VPerson[]) || []);
    },
    [db]
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
    if (!session) {
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
    let { data } = await db.from("profiles").select("*").eq("id", session.user.id).single();
    if (stale()) return;
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
    await loadPeople(chosen);
    if (stale()) return;
    setPhase("app");
  }, [db, loadPeople, toast]);

  // auth events
  useEffect(() => {
    // an invitation link (?invite=token) is remembered, then removed from the address bar
    try {
      const t = new URLSearchParams(location.search).get("invite");
      if (t) {
        localStorage.setItem("vv_invite", t);
        history.replaceState(null, "", location.pathname);
      }
    } catch {}
    const { data: sub } = db.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") recovering.current = true;
      if (ev === "TOKEN_REFRESHED") return;
      // SIGNED_IN also fires when the tab regains focus; only re-boot if the user changed
      if (ev === "SIGNED_IN" && session?.user.id === userId.current) return;
      setTimeout(boot, 0);
    });
    return () => sub.subscription.unsubscribe();
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

  const submit = useCallback(
    async (rows: NewRequest[], okMsg: string): Promise<string | null> => {
      const { data, error } = await db.from("change_requests").insert(rows).select("id");
      if (error) return error.message;
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
    [db, perms.isAdm, reload, toast]
  );

  const send = useCallback(
    async (action: RequestAction, personId: string | null, payload: Record<string, unknown>, note: string) => {
      if (!me) return "लगइन आवश्यक छ।";
      const bad = guardRequest(perms, action, personId, payload);
      if (bad) return bad;
      return submit([makeRequest(me, action, personId, payload, note)], "✅ अनुरोध पठाइयो — एडमिनको स्वीकृतिपछि देखिनेछ");
    },
    [me, perms, submit]
  );

  const value: Vansh = {
    db, phase, me, act, setAct, roles, people, g, access, perms, tab, setTab, sel, pick, unpick, toast, toastMsg,
    reload, boot, openDialog, closeDialog, dialog, submit, send, treeApi,
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
