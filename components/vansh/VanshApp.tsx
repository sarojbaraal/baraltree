"use client";
// App shell: header (tabs, user, theme), the active view, profile panel, dialogs, toast, PWA install button.
import React, { useEffect, useState } from "react";
import { ROLE_L } from "@/lib/vansh/graph";
import type { Role, TabKey } from "@/lib/vansh/types";
import { VanshProvider, useVansh } from "./VanshContext";
import { DialogHost, Toast } from "./ui";
import { AuthView, PendingView, PosView, ResetView } from "./AuthViews";
import { FamView, MemView } from "./ListViews";
import TreeView from "./TreeView";
import DetailPanel from "./DetailPanel";
import { AdminView, MineView } from "./RequestViews";
import OverviewView from "./OverviewView";

const APP_VER = process.env.NEXT_PUBLIC_APP_VER || "dev";

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const cur = () => (document.documentElement.dataset.theme as "light" | "dark") || (mq.matches ? "dark" : "light");
    setTheme(cur());
    const h = () => setTheme(cur());
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);
  const toggle = () => {
    const n = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = n;
    try {
      localStorage.setItem("vv_theme", n);
    } catch {}
    setTheme(n);
  };
  return { theme, toggle };
}

function InstallButton() {
  const [ev, setEv] = useState<Event & { prompt?: () => void } | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEv(e as Event & { prompt?: () => void });
    };
    addEventListener("beforeinstallprompt", h);
    return () => removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!ev) return null;
  return (
    <button
      id="inst"
      onClick={() => {
        ev.prompt?.();
        setEv(null);
      }}
    >
      📲 एप इन्स्टल गर्नुहोस्
    </button>
  );
}

function Shell() {
  const { db, phase, me, act, roles, setAct, tab, setTab, sel, perms, treeApi, people } = useVansh();
  const { theme, toggle } = useTheme();
  const [wide, setWide] = useState(true);
  const [hdrH, setHdrH] = useState(72);

  useEffect(() => {
    const f = () => {
      setWide(innerWidth > 640);
      setHdrH((document.querySelector("header")?.offsetHeight || 60) + 22);
    };
    f();
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, [phase]);

  // register the service worker (offline shell)
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const inApp = phase === "app";
  const eff: TabKey =
    (tab === "mine" && act === "general") || ((tab === "admin" || tab === "ov") && !perms.isStaff) ? "fam" : tab;
  const panelOpen = inApp && !!sel && !!people.length;
  const pushed = panelOpen && wide;

  useEffect(() => {
    document.body.classList.toggle("det-open", pushed);
    return () => document.body.classList.remove("det-open");
  }, [pushed]);

  const tabs: [TabKey, string][] = [
    ["fam", "🏡 परिवार"],
    ["tree", "🌳 चार्ट"],
    ["mem", "👥 सदस्य"],
    ...(act !== "general" ? ([["mine", "📋 अनुरोध"]] as [TabKey, string][]) : []),
    ...(perms.isStaff ? ([["admin", "⚙ एडमिन"]] as [TabKey, string][]) : []),
  ];

  const dispName = (me?.position_person_id && people.find((p) => p.id === me.position_person_id)?.name) || me?.full_name || me?.email || "";
  const showWho = phase === "app" || phase === "pos" || phase === "pending";

  let body: React.ReactNode = null;
  if (phase === "auth") body = <AuthView />;
  else if (phase === "reset") body = <ResetView />;
  else if (phase === "pos") body = <PosView />;
  else if (phase === "pending") body = <PendingView />;
  else if (inApp)
    body = {
      fam: <FamView />,
      tree: <TreeView />,
      mem: <MemView />,
      mine: <MineView />,
      admin: <AdminView />,
      ov: <OverviewView />,
    }[eff];

  return (
    <>
      <div className="bgfx" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <header>
        <h1
          style={{ cursor: "pointer" }}
          title="मुख्य पृष्ठ"
          onClick={() => {
            if (!me || !roles.length) return;
            setTab("fam");
            scrollTo(0, 0);
          }}
        >
          <span className="mono" aria-hidden="true">व</span>
          <span>हाम्रो वंशावली</span>
        </h1>
        <nav id="tabs" aria-label="मुख्य मेनु">
          {inApp &&
            tabs.map(([k, l]) => (
              <button key={k} className={eff === k || (k === "fam" && eff === "ov") ? "on" : ""} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
        </nav>
        <div id="who">
          {showWho && (
            <>
              <span className="wn">{dispName}</span>
              {roles.length > 1 ? (
                <select aria-label="भूमिका छान्नुहोस्" value={act || ""} onChange={(e) => setAct(e.target.value as Role)}>
                  {roles.map((r) => (
                    <option key={r} value={r}>{ROLE_L[r]}</option>
                  ))}
                </select>
              ) : (
                <span className="tag">{(act && ROLE_L[act]) || "पर्खाइमा"}</span>
              )}
              <button className="ghost" id="out" onClick={() => db.auth.signOut()}>बाहिर</button>
            </>
          )}
        </div>
        <button className="ghost" id="tm" aria-label="डार्क/लाइट मोड" title={theme === "dark" ? "लाइट मोड" : "डार्क मोड"} onClick={toggle}>
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <span id="ver" tabIndex={0} aria-label="संस्करण" data-t={perms.isAdm ? `Build: ${APP_VER}` : APP_VER}>
          ⓘ
        </span>
      </header>
      <main id="app" className={inApp && eff === "tree" ? "wide" : ""} style={pushed ? { marginLeft: 390, marginRight: 0 } : undefined}>
        {phase === "loading" ? null : body}
      </main>
      {panelOpen && (
        <div style={pushed ? ({ ["--det-top" as string]: `${hdrH}px` } as React.CSSProperties) : undefined}>
          <DetailPanel
            top={pushed ? hdrH : undefined}
            depthOf={eff === "tree" ? (id) => treeApi.current?.depthOf(id) : undefined}
            onGo={eff === "tree" ? (id) => treeApi.current?.reveal(id) : undefined}
            onPrint={eff === "tree" ? (id) => treeApi.current?.print(id) : undefined}
          />
        </div>
      )}
      <DialogHost />
      <Toast />
      <InstallButton />
    </>
  );
}

export default function VanshApp() {
  return (
    <VanshProvider>
      <Shell />
    </VanshProvider>
  );
}
