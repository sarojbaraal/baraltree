"use client";
// "परिवार" (family) and "सदस्य" (members) tabs — ported from the original app.js famView / memView.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { famGroups, relMap } from "@/lib/vansh/relations";
import { ROLE_L, type Graph } from "@/lib/vansh/graph";
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

// ---------------- सदस्य tab ----------------
type FKey = "gender" | "age" | "marital" | "surname";
type Status = "live" | "dead" | "all";

const KEYS: FKey[] = ["gender", "age", "marital", "surname"];
const TABS: { k: FKey; label: string; opts: [string, string][] }[] = [
  { k: "gender", label: "लिङ्ग", opts: [["F", "👩 महिला"], ["M", "👨 पुरुष"]] },
  { k: "age", label: "उमेर", opts: [["0", "०–२०"], ["20", "२०–४०"], ["40", "४०–६०"], ["60", "६०–८०"], ["80", "८०+"]] },
  { k: "marital", label: "वैवाहिक", opts: [["m", "विवाहित"], ["u", "अविवाहित"]] },
  { k: "surname", label: "थर", opts: [["b2o", "बराल → अन्य"], ["o2b", "अन्य → बराल"]] },
];
const STATUS: [Status, string][] = [["all", "सबै"], ["live", "🟢 जीवित"], ["dead", "🕊 दिवंगत"]];
const BARAL = "बराल";
const EMPTY_F: Record<FKey, string[]> = { gender: [], age: [], marital: [], surname: [] };

const ageGroupOf = (p: VPerson): string | null => {
  if (!p.is_living && !p.death_bs) return null;
  const a = ageN(p.birth_bs, p.is_living ? "" : p.death_bs);
  return a == null ? null : String(Math.min(80, Math.floor(a / 20) * 20));
};
/** b2o = बरालबाट अन्य, o2b = अन्यबाट बराल (विवाहपछि थर बदलिएका महिला मात्र) */
const surnameChangeOf = (g: Graph, p: VPerson): string | null => {
  if (p.gender !== "F") return null;
  const sp = g.spousesOf(p)[0];
  const maiden = p.maiden_name || surnameOf(p.father_id ? g.byId[p.father_id]?.name : "");
  const married = p.married_name || (sp ? surnameOf(g.byId[sp]?.name) : "");
  if (!maiden || !married || maiden === married) return null;
  if (maiden === BARAL) return "b2o";
  if (married === BARAL) return "o2b";
  return null;
};
const valueOf = (g: Graph, p: VPerson, k: FKey): string | null =>
  k === "gender" ? p.gender || null : k === "age" ? ageGroupOf(p) : k === "marital" ? (g.spousesOf(p).length ? "m" : "u") : surnameChangeOf(g, p);

export function MemView() {
  const { g, perms, pick } = useVansh();
  const [status, setStatus] = useState<Status>("live");
  const [tab, setTab] = useState<FKey>("gender");
  const [open, setOpen] = useState(true);
  const [f, setF] = useState<Record<FKey, string[]>>(EMPTY_F);

  const toggle = (k: FKey, v: string) =>
    setF((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));
  const total = KEYS.reduce((a, k) => a + f[k].length, 0);

  const { list, counts } = useMemo(() => {
    const base = g.people.filter((p) => perms.can(p.id) && (status === "all" || (status === "live") === p.is_living));
    // एउटै tab भित्र OR, फरक tab बीच AND. `skip` = त्यो tab को आफ्नै छनोट नगनिने (badge को सङ्ख्याका लागि)
    const ok = (p: VPerson, skip?: FKey) =>
      KEYS.every((k) => {
        if (k === skip || !f[k].length) return true;
        const v = valueOf(g, p, k);
        return !!v && f[k].includes(v);
      });
    const list = base.filter((p) => ok(p)).sort(g.byBirth);
    const counts: Record<string, number> = {};
    TABS.forEach((t) => {
      const pool = base.filter((p) => ok(p, t.k));
      t.opts.forEach(([v]) => (counts[`${t.k}:${v}`] = pool.filter((p) => valueOf(g, p, t.k) === v).length));
    });
    return { list, counts };
  }, [g, perms, status, f]);

  const cur = TABS.find((t) => t.k === tab)!;
  const big = tab !== "age";

  return (
    <>
      <section className="mf">
        {/* १. जीवित / दिवंगत segmented control */}
        <div className="mf-seg" role="tablist" aria-label="अवस्था">
          <span className="mf-ind" style={{ transform: `translateX(${STATUS.findIndex(([s]) => s === status) * 100}%)` }} />
          {STATUS.map(([s, l]) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {l}
            </button>
          ))}
        </div>

        {/* फिल्टर खोल्ने / बन्द गर्ने */}
        <div className="mf-head">
          <button className="mf-fold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            ⚙ फिल्टर {total > 0 && <em>{np(total)}</em>}
            <i className={open ? "up" : ""} />
          </button>
          {total > 0 && (
            <button className="mf-clear" onClick={() => setF(EMPTY_F)}>सबै फिल्टर हटाउनुहोस्</button>
          )}
        </div>

        <div className={`mf-body ${open ? "" : "shut"}`}>
          <div>
            {/* २. tab */}
            <div className="mf-tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}>
                  {t.label}
                  {f[t.k].length > 0 && <em>{np(f[t.k].length)}</em>}
                </button>
              ))}
            </div>

            {/* ३. विकल्प */}
            <div className={big ? "mf-grid" : "mf-scroll"}>
              {cur.opts.map(([v, l]) => {
                const on = f[tab].includes(v);
                return (
                  <button key={v} className={`mf-opt ${big ? "big" : "pill"} ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(tab, v)}>
                    {l}
                    <em>{np(counts[`${tab}:${v}`] ?? 0)}</em>
                  </button>
                );
              })}
            </div>

            {/* चयन गरिएका फिल्टरका removable chip */}
            {total > 0 && (
              <div className="mf-chips">
                {TABS.flatMap((t) =>
                  f[t.k].map((v) => (
                    <button key={t.k + v} className="mf-chip" onClick={() => toggle(t.k, v)} aria-label="हटाउनुहोस्">
                      {t.opts.find(([x]) => x === v)?.[1]} ✕
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mf-count"><b>{np(list.length)}</b> सदस्यहरू देखाइएको</p>
      </section>

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
          <div className="card mf-empty">
            <b>कुनै सदस्य भेटिएन</b>
            <p className="mut">फिल्टर हटाएर पुनः प्रयास गर्नुहोस्।</p>
            {total > 0 && <button onClick={() => setF(EMPTY_F)}>सबै फिल्टर हटाउनुहोस्</button>}
          </div>
        )}
      </div>
    </>
  );
}
