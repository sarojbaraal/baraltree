"use client";
// "परिवार" (family) and "सदस्य" (members) tabs — ported from the original app.js famView / memView.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { famGroups, relMap } from "@/lib/vansh/relations";
import { ROLE_L } from "@/lib/vansh/graph";
import { ageN, dispName, match, np, surnameOf, yr } from "@/lib/vansh/text";  
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar, KidCount } from "./ui";
import { AnchorDialog, PersonForm } from "./PersonDialogs";

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
  const hits = ql ? people.filter((p) => can(p.id) && (match(p.name, ql) || (R[p.id] || "").includes(ql))).slice(0, 50) : [];
  const [showHits, setShowHits] = useState(false);

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
        <div className="mav2"><Avatar g={p.gender} /></div>
        <div className="mn">{dispName(p, true)}</div>
        <div className="my"><i className={`st ${p.is_living ? "live" : "gone"}`} title={p.is_living ? "जीवित" : "दिवंगत"} />{R[p.id] || "साइनो स्पष्ट छैन"}</div>
        <KidCount kids={kidsOf(p)} />
        {mine ? <span className="me">तपाईं</span> : null}
      </div>
    );
  };
  const lrow = (p: VPerson) => (
    <div key={p.id} className={`mlc ${p.is_living ? "" : "dead"} ${flashId === p.id ? "flash" : ""}`} data-id={p.id} onClick={() => pick(p.id)}>
      <div className={`mav2 sm g${p.gender || "O"}`}><Avatar g={p.gender} /></div>
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
        </div>
      </section>
      <div className="stickybar">
      <button className="locate" disabled={!base} onClick={() => base && showCard(base.id)}>📍 मेरो स्थान</button>
      <div className="qw msw">
        <input
          className="msearch"
          placeholder="🔍 नाम वा साइनो खोज्नुहोस्…"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            qText.fam = e.target.value;
            setQ(e.target.value);
            setShowHits(true);
          }}
        />
        <button className="ghost qx" hidden={!q} aria-label="खोज मेट्ने" onClick={() => { qText.fam = ""; setQ(""); }}>✕</button>
        <div className="qr" hidden={!ql || !showHits}>
          {hits.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                qText.fam = p.name;
                setQ(p.name);
                setShowHits(false);
                pick(p.id);
                showCard(p.id);
              }}
            >
              <b>{dispName(p)}</b>
              <small>
                {R[p.id] || "साइनो छैन"}
                {yr(p.birth_bs) ? " · " + yr(p.birth_bs) : ""}
              </small>
            </div>
          ))}
          {!hits.length && <div className="none">कोही भेटिएन</div>}
        </div>
      </div>
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
  // ---------------- सदस्य tab ----------------
type FKey = "gender" | "age" | "marital" | "surname";
type Status = "live" | "dead" | "all";

const FILTER_TABS: { k: FKey; label: string; opts: [string, string][] }[] = [
  { k: "gender", label: "लिङ्ग", opts: [["F", "महिला"], ["M", "पुरुष"]] },
  { k: "age", label: "उमेर समूह", opts: [["0", "०–२०"], ["20", "२०–४०"], ["40", "४०–६०"], ["60", "६०–८०"], ["80", "८०+"]] },
  { k: "marital", label: "वैवाहिक अवस्था", opts: [["m", "विवाहित"], ["u", "अविवाहित"]] },
  { k: "surname", label: "थर परिवर्तन", opts: [["b2o", "बरालबाट अन्य"], ["o2b", "अन्यबाट बराल"]] },
];
const BARAL = "बराल";
const EMPTY_F: Record<FKey, string[]> = { gender: [], age: [], marital: [], surname: [] };

export function MemView() {
  const { g, perms, pick } = useVansh();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("live");
  const [openTab, setOpenTab] = useState<FKey | null>(null);
  const [f, setF] = useState<Record<FKey, string[]>>(EMPTY_F);

  const toggleOpt = (k: FKey, v: string) =>
    setF((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));
  const activeCount = Object.values(f).reduce((a, l) => a + l.length, 0);

  const ageGroup = (p: VPerson): string | null => {
    if (!p.is_living && !p.death_bs) return null;
    const a = ageN(p.birth_bs, p.is_living ? "" : p.death_bs);
    return a == null ? null : String(Math.min(80, Math.floor(a / 20) * 20));
  };
  /** b2o = बरालबाट अन्य, o2b = अन्यबाट बराल (विवाहपछि थर बदलिएका महिला मात्र) */
  const surnameChange = (p: VPerson): string | null => {
    if (p.gender !== "F") return null;
    const sp = g.spousesOf(p)[0];
    const maiden = p.maiden_name || surnameOf(p.father_id ? g.byId[p.father_id]?.name : "");
    const married = p.married_name || (sp ? surnameOf(g.byId[sp]?.name) : "");
    if (!maiden || !married || maiden === married) return null;
    if (maiden === BARAL) return "b2o";
    if (married === BARAL) return "o2b";
    return null;
  };

  const ql = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      g.people
        .filter((p) => {
          if (!perms.can(p.id)) return false;
          if (ql && !match(p.name, ql)) return false;
          if (status === "live" && !p.is_living) return false;
          if (status === "dead" && p.is_living) return false;
          if (f.gender.length && !f.gender.includes(p.gender || "")) return false;
          if (f.age.length) {
            const a = ageGroup(p);
            if (!a || !f.age.includes(a)) return false;
          }
          if (f.marital.length && !f.marital.includes(g.spousesOf(p).length ? "m" : "u")) return false;
          if (f.surname.length) {
            const s = surnameChange(p);
            if (!s || !f.surname.includes(s)) return false;
          }
          return true;
        })
        .sort(g.byBirth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g, perms, ql, status, f]
  );

  return (
    <>
      <div className="row" style={{ margin: "0 0 .7rem" }}>
        <button className={`ghost ${status === "all" ? "on" : ""}`} onClick={() => setStatus("all")}>सबै</button>
        <button className={`ghost ${status === "live" ? "on" : ""}`} onClick={() => setStatus("live")}>🟢 जीवित</button>
        <button className={`ghost ${status === "dead" ? "on" : ""}`} onClick={() => setStatus("dead")}>🕊 दिवंगत</button>
        <input
          className="msearch"
          style={{ width: 170, marginBottom: 0, marginLeft: "auto", padding: ".4rem .7rem", fontSize: ".85rem" }}
          placeholder="🔍 खोज…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rchips" style={{ margin: ".4rem 0" }}>
        {FILTER_TABS.map((t) => (
          <button key={t.k} className={`ghost ${openTab === t.k ? "on" : ""}`} onClick={() => setOpenTab(openTab === t.k ? null : t.k)}>
            {t.label}{f[t.k].length ? ` (${np(f[t.k].length)})` : ""}
          </button>
        ))}
        {activeCount > 0 && (
          <button className="bad" onClick={() => setF(EMPTY_F)}>✕ सबै हटाउने</button>
        )}
      </div>
      {openTab && (
        <div className="rchips" style={{ margin: "0 0 .8rem" }}>
          {FILTER_TABS.find((t) => t.k === openTab)!.opts.map(([v, l]) => (
            <button key={v} className={`ghost ${f[openTab].includes(v) ? "on" : ""}`} onClick={() => toggleOpt(openTab, v)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <p className="mut" style={{ margin: "0 0 .6rem" }}>{np(list.length)} सदस्य</p>

      <div className="mgrid" id="mg">
        {list.length ? (
          list.map((p) => (
            <div key={p.id} className={`mlc ${p.is_living ? "" : "dead"}`} data-id={p.id} onClick={() => pick(p.id)}>
              <div className={`mav2 sm g${p.gender || "O"}`}><Avatar g={p.gender} /></div>
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
}
