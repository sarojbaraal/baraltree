"use client";
// "परिवार" (family) and "सदस्य" (members) tabs — ported from the original app.js famView / memView.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { famGroups, relMap } from "@/lib/vansh/relations";
import { ROLE_L } from "@/lib/vansh/graph";
import { dispName, match, np, yr } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar, KidCount } from "./ui";
import PersonSearch from "./PersonSearch";
import { AnchorDialog, PersonForm } from "./PersonDialogs";
import DownloadMenu from "./DownloadMenu";

// search text survives tab switches, like the original
export const qText = { tree: "", fam: "" };

export function FamView() {
  const { g, me, act, perms, access, people, pick, setTab, openDialog, myPosId } = useVansh();
  const { byId, kidsOf, byBirth } = g;
  const { can, isAdm, isStaff } = perms;
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const [q, setQ] = useState(qText.fam);
  const [focus, setFocus] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const R = useMemo(() => relMap(g, me).R, [g, me]);
  const base = me?.position_person_id ? byId[me.position_person_id] : me?.position_parent_id ? byId[me.position_parent_id] : undefined;
  const has = !!(base || (me?.position_grand_id && byId[me.position_grand_id]));
  const groups = useMemo(() => (me ? famGroups(g, me, perms, R) : []), [g, me, perms, R]);
  const ic = has ? groups[0]?.members.length || 0 : 0;
  const msg = !access.acc
    ? "सबै वंशावली तपाईंको लागि खुला छ।"
    : base
    ? "तपाईंको भूमिकाअनुसार खुला भएको वंश मात्र देखिन्छ। बाँकी शाखा चार्टमा धमिला र लक छन्।"
    : "तपाईंको स्थान अझै तोकिएको छैन। एडमिनले तोकेपछि शाखा खुल्नेछ।";
  const meName = (me?.position_person_id && byId[me.position_person_id]?.name) || me?.full_name || me?.email || "";

  const ql = q.trim().toLowerCase();
  const visiblePeople = useMemo(() => people.filter((p) => can(p.id)), [people, can]);

  const showCard = (id: string) => {
    const gi = groups.findIndex((gr) => gr.members.some((p) => p.id === id));
    if (gi >= 0) setOpen((o) => new Set(o).add(gi));
    setFocus(id);
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 2600);
  };
  useEffect(() => {
    if (!focus) return;
    const t = setTimeout(() => ref.current?.querySelector(`[data-id="${focus}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    return () => clearTimeout(t);
  }, [focus]);

  const card = (p: VPerson, core: boolean) => {
    const mine = p.id === me?.position_person_id;
    return (
      <div
        key={p.id}
        className={`mc g${p.gender || "O"} ${core ? "core" : ""} ${mine ? "mine" : ""} ${p.is_living ? "" : "dead"} ${flashId === p.id ? "flash" : ""}`}
        tabIndex={0}
        data-id={p.id}
        onClick={() => pick(p.id)}
        onKeyDown={(e) => e.key === "Enter" && pick(p.id)}
      >
        <div className="mav2"><Avatar g={p.gender} photo={p.photo_url} /></div>
        <div className="mn">{dispName(p, true)}</div>
        <div className="my"><i className={`st ${p.is_living ? "live" : "gone"}`} title={p.is_living ? "जीवित" : "दिवंगत"} />{R[p.id] || "साइनो स्पष्ट छैन"}</div>
        <KidCount kids={kidsOf(p)} />
        {mine ? <span className="me">तपाईं</span> : null}
      </div>
    );
  };
  const lrow = (p: VPerson) => (
    <div key={p.id} className={`mlc ${p.is_living ? "" : "dead"} ${flashId === p.id ? "flash" : ""}`} data-id={p.id} onClick={() => pick(p.id)}>
      <div className={`mav2 sm g${p.gender || "O"}`}><Avatar g={p.gender} photo={p.photo_url} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{dispName(p)}</b>
        <br />
        <span className="mut">
          {R[p.id] || "साइनो स्पष्ट छैन"}
          {yr(p.birth_bs) ? " · " + yr(p.birth_bs) : ""}
        </span>
      </div>
      <KidCount kids={kidsOf(p)} />
    </div>
  );

  const visible = groups
    .map((gr, gi) => ({ gr, gi, l: gr.members.filter((p) => !ql || p.name.toLowerCase().includes(ql) || (R[p.id] || "").includes(ql)) }))
    .filter((x) => x.l.length);

  return (
    <>
      <section className="hero2">
        <div className="hello">
          <span className="hchip">{act ? ROLE_L[act] : ""}</span>
          <h2>नमस्ते, {meName}</h2>
          <p>{msg}</p>
        </div>
        <div className="stats">
          <div><b>{np(ic)}</b><span>अहिलेको परिवार</span></div>
          <div><b>{np(access.acc ? access.acc.size : people.length)}</b><span>खुला सदस्य</span></div>
          <div><b>{np(people.length)}</b><span>कुल सदस्य</span></div>
        </div>
        <div className="row">
          {act !== "general" && (
            <button className="ghost" onClick={() => openDialog(<PersonForm action="add" />, true)}>
              {isAdm ? "+ सदस्य थप्ने" : "+ सदस्य थप्ने अनुरोध"}
            </button>
          )}
          <button className="ghost" onClick={() => openDialog(<AnchorDialog />)}>🧭 नाता सन्दर्भ</button>
          {isStaff && <button className="ghost" onClick={() => setTab("ov")}>📊 Family Overview</button>}
          <DownloadMenu />
        </div>
      </section>
      <div className="stickybar">
      <button className="locate" disabled={!base} onClick={() => base && showCard(base.id)}>📍 मेरो स्थान</button>
      <PersonSearch
        id="fq"
        className="msw"
        value={q}
        people={visiblePeople}
        rel={R}
        onChange={(t) => {
          qText.fam = t;
          setQ(t);
        }}
        onChoose={(id) => {
          const p = byId[id];
          qText.fam = p?.name || "";
          setQ(p?.name || "");
          pick(id);
          showCard(id);
        }}
      />
      </div>
      <div className="rchips">
        <button className={`ghost ${mode === "grid" ? "on" : ""}`} onClick={() => setMode("grid")}>▦ थम्बनेल</button>
        <button className={`ghost ${mode === "list" ? "on" : ""}`} onClick={() => setMode("list")}>☰ सूची</button>
        <button
          className="ghost"
          onClick={() => setOpen(visible.some((x) => !open.has(x.gi)) ? new Set(groups.map((_, i) => i)) : new Set())}
        >
          ⇕ सबै खोल्ने / बन्द
        </button>
      </div>
      <div id="fgroups" ref={ref}>
        {visible.length ? (
          visible.map(({ gr, gi, l }) => (
            <details
              className="acc"
              key={gi}
              open={open.has(gi)}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                setOpen((o) => {
                  if (o.has(gi) === isOpen) return o;
                  const n = new Set(o);
                  if (isOpen) n.add(gi);
                  else n.delete(gi);
                  return n;
                });
              }}
            >
              <summary>
                <span className="acc-t">{gr.title}</span>
                <span className="acc-n">{np(l.length)}</span>
              </summary>
              <div className="acc-b">
                <div className={mode === "list" ? "mgrid" : "cgrid"}>
                  {l.map((p) => (mode === "list" ? lrow(p) : card(p, has && gi === 0)))}
                </div>
              </div>
            </details>
          ))
        ) : (
          <div className="card">कोही भेटिएन।</div>
        )}
      </div>
    </>
  );
}

export function MemView() {
  const { g, me, perms, pick } = useVansh();
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const R = useMemo(() => relMap(g, me).R, [g, me]);
  const visiblePeople = useMemo(() => g.people.filter((p) => perms.can(p.id)), [g.people, perms]);
  const list = visiblePeople.filter((p) => !ql || match(p.name, ql) || (R[p.id] || "").includes(ql)).sort(g.byBirth);
  return (
    <>
      <PersonSearch id="mq" className="msw" value={q} people={visiblePeople} rel={R} placeholder="🔍 सदस्य वा साइनो खोज्नुहोस्…" onChange={setQ} onChoose={(id) => pick(id)} />
      <div className="mgrid" id="mg">
        {list.length ? (
          list.map((p) => (
            <div key={p.id} className="mlc" data-id={p.id} onClick={() => pick(p.id)}>
              <div className={`mav2 sm g${p.gender || "O"}`}><Avatar g={p.gender} photo={p.photo_url} /></div>
              <div>
                <b>{dispName(p)}</b>
                <br />
                <span className="mut">
                  {(p.gender === "M" ? "पुरुष" : p.gender === "F" ? "महिला" : "") + " · " + (yr(p.birth_bs) || "?")}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="card">कोही भेटिएन।</div>
        )}
      </div>
    </>
  );
}
