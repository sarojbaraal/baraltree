"use client";
// "अनुरोध" (my requests) and "एडमिन" (admin) tabs — ported from the original app.js mineView / adminView.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeRequest, VPerson, VProfile } from "@/lib/vansh/types";
import { ORDER, ROLE_L } from "@/lib/vansh/graph";
import { ACT, STATUS, describeRequest, groupBatches } from "@/lib/vansh/requests";
import { np } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";
import { Sx, personOptions, useSx } from "./ui";
import { AcctDialog, AvatarsDialog } from "./AdminDialogs";
import { AnchorDialog } from "./PersonDialogs";
import ReviewPanel, { reviewCount } from "./ReviewPanel";
import { reviewIssues } from "@/lib/vansh/review";

function Req({ r, byId }: { r: ChangeRequest; byId: Record<string, VPerson> }) {
  const d = describeRequest(r, byId);
  return (
    <>
      <b>{d.action}</b>
      {d.who ? ` — ${d.who}` : ""}
      {d.lines.map((l, i) => (
        <React.Fragment key={i}>
          <br />
          {l}
        </React.Fragment>
      ))}
      {d.note && (
        <>
          <br />
          <span className="mut">सन्देश: {d.note}</span>
        </>
      )}
    </>
  );
}

export function MineView() {
  const { db, me, g } = useVansh();
  const [rows, setRows] = useState<ChangeRequest[] | null>(null);
  useEffect(() => {
    if (!me) return;
    db.from("change_requests")
      .select("*")
      .eq("requested_by", me.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as ChangeRequest[]) || []));
  }, [db, me]);
  const by: Record<string, ChangeRequest[]> = {};
  (rows || []).forEach((r) => (by[r.status] ||= []).push(r));
  const keys = ["pending", "approved", "rejected"].filter((s) => by[s]);
  if (rows === null) return null;
  if (!keys.length) return <div className="card">अझै कुनै अनुरोध छैन।</div>;
  return (
    <>
      {keys.map((s) => (
        <details className="hcat" key={s} open={s === "pending"}>
          <summary>
            <span>{STATUS[s]}</span>
            <span className="cnt">{np(by[s].length)}</span>
          </summary>
          <div className="reqgrid hscroll">
            {by[s].map((r) => (
              <div className="card" key={r.id}>
                <Req r={r} byId={g.byId} />
                {r.reject_reason && <p className="mut">कारण: {r.reject_reason}</p>}
              </div>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}

// ---------------- admin ----------------
type Sec = "req" | "new" | "mem" | "hist" | "rev";
const REQ_SEL = "*, profiles!change_requests_requested_by_fkey(full_name,email)";

function RoleBoxes({ roles, onChange }: { roles: string[]; onChange: (r: string[]) => void }) {
  return (
    <div className="roles">
      {ORDER.slice().reverse().map((r) => (
        <label className="rcb" key={r}>
          <input
            type="checkbox"
            checked={roles.includes(r)}
            onChange={(e) => onChange(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))}
          />{" "}
          {ROLE_L[r]}
        </label>
      ))}
    </div>
  );
}

const initialRoles = (u: VProfile): string[] => {
  const base = u.roles || (u.role === "admin" ? [...ORDER] : u.role === "member" ? ["general"] : []);
  return !u.roles?.length && u.role === "pending" ? ["general"] : base;
};

function UserCard({ u, isNew, onSave, onAnchor }: { u: VProfile; isNew: boolean; onSave: (u: VProfile, roles: string[], pos: string) => Promise<void>; onAnchor: () => void }) {
  const { g, perms } = useVansh();
  const [roles, setRoles] = useState<string[]>(() => initialRoles(u));
  const sx = useSx({ value: u.position_person_id, label: u.position_person_id ? g.byId[u.position_person_id]?.name || "" : "" });
  const opts = useMemo(
    () =>
      personOptions(g, perms, (p) => {
        const f = p.father_id ? g.byId[p.father_id] : null;
        return (f ? " (बुबा: " + f.name + ")" : "") + (p.birth_bs ? " · " + String(p.birth_bs).slice(0, 4) : "");
      }),
    [g, perms]
  );
  const c = u.position_person_id ? g.byId[u.position_person_id] : null;
  const q = u.position_parent_id ? g.byId[u.position_parent_id] : null;
  const gr = u.position_grand_id ? g.byId[u.position_grand_id] : null;
  return (
    <div className="card">
      <b>{u.full_name || "—"}</b> · <span className={isNew ? "" : "mut"}>{u.email}</span>
      {isNew && (
        <p className="mut">
          {c ? <>स्थान: {c.name}<br /></> : q ? <>स्थान: {q.name} को सन्तान<br /></> : gr ? <>स्थान: {gr.name} को वंश<br /></> : null}
          दिएको परिचय — बुबा: <b>{u.claim_father || "—"}</b> · हजुरबुबा: <b>{u.claim_grand || "—"}</b>
          {(u.birth_bs || u.phone || u.location) && (
            <>
              <br />
              जन्म मिति: <b>{u.birth_bs || "—"}</b> · फोन: <b>{u.phone || "—"}</b> · ठेगाना: <b>{u.location || "—"}</b>
              {sx.value && g.byId[sx.value] && (() => {
                const t = g.byId[sx.value];
                const d: string[] = [];
                if (u.birth_bs && t.birth_bs && t.birth_bs !== u.birth_bs) d.push(`जन्म मिति (अहिले: ${t.birth_bs})`);
                if (u.phone && t.phone && t.phone !== u.phone) d.push(`फोन (अहिले: ${t.phone})`);
                if (u.location && t.address && t.address !== u.location) d.push(`ठेगाना (अहिले: ${t.address})`);
                return (
                  <>
                    <br />
                    <span className="mut">स्वीकृत गर्दा {t.name} का खाली फिल्डमा मात्र भरिन्छ।{d.length ? " फरक परेका (नबदलिने): " + d.join(", ") : ""}</span>
                  </>
                );
              })()}
            </>
          )}
        </p>
      )}
      <RoleBoxes roles={roles} onChange={setRoles} />
      <Sx st={sx} options={opts} />
      <div className="row">
        <button
          className={isNew ? "" : "ghost"}
          onClick={async () => {
            if (!roles.length) return alert("कम्तिमा एउटा भूमिका छान्नुहोस्।");
            if (isNew && !sx.value) return alert("पहिले वंशावलीमा यिनको स्थान छान्नुहोस् (नाम टाइप गरेर खोज्नुहोस्)।");
            await onSave(u, roles, sx.value);
          }}
        >
          {isNew ? "स्वीकृत गर्ने" : "सुरक्षित गर्ने"}
        </button>
        <button className="ghost" onClick={onAnchor}>🧭 नाता सन्दर्भ{u.custom_anchor ? " ✓" : ""}</button>
      </div>
    </div>
  );
}

export function AdminView() {
  const { db, g, perms, toast, reload, openDialog } = useVansh();
  const adm = perms.isAdm;
  const [sec, setSec] = useState<Sec>("req");
  const [reqCat, setReqCat] = useState("all");
  const [histOpen, setHistOpen] = useState<string[]>([]);
  const [data, setData] = useState<{ reqs: ChangeRequest[]; users: VProfile[]; hist: ChangeRequest[] } | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: reqs }, { data: users }, { data: hist }] = await Promise.all([
      db.from("change_requests").select(REQ_SEL).eq("status", "pending").order("created_at"),
      adm ? db.from("profiles").select("*").order("full_name") : Promise.resolve({ data: [] }),
      adm
        ? db.from("change_requests").select(REQ_SEL).neq("status", "pending").order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
    ]);
    setData({ reqs: (reqs as ChangeRequest[]) || [], users: (users as VProfile[]) || [], hist: (hist as ChangeRequest[]) || [] });
  }, [db, adm]);
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  const anchorFor = (u: VProfile) => openDialog(<AnchorDialog userId={u.id} current={u.custom_anchor} onDone={fetchAll} />);

  const refresh = async () => {
    toast("✅ सुरक्षित भयो");
    await reload();
    await fetchAll();
  };

  if (!data) return null;
  const { reqs, users, hist } = data;
  const pend = users.filter((u) => !u.roles?.length && u.role === "pending");
  const mem = users.filter((u) => !pend.includes(u));
  const groups = groupBatches(reqs);
  const okIds = hist.filter((r) => r.status === "approved").map((r) => r.id);
  const cn = (c: string) => (c === "all" ? groups.length : groups.filter((x) => x.items[0].action === c).length);
  const keys: Sec[] = adm ? ["req", "new", "mem", "rev", "hist"] : ["req"];
  const cur: Sec = keys.includes(sec) ? sec : keys[0];

  const approve = async (ids: string[]) => {
    let err;
    for (const id of ids) {
      const rq = reqs.find((x) => x.id === id);
      ({ error: err } = await db.rpc("review_request", { req: id, approve: true }));
      if (!err && rq?.person_id && (rq.payload as Record<string, unknown> | null)?.facebook !== undefined)
        ({ error: err } = await db.rpc("set_facebook", { pid: rq.person_id, url: (rq.payload as Record<string, unknown>).facebook }));
      if (err) break;
    }
    if (err) return alert(err.message);
    await refresh();
  };
  const reject = async (ids: string[]) => {
    const reason = prompt("अस्वीकार गर्ने कारण?");
    if (reason === null) return;
    let err;
    for (const id of ids) {
      ({ error: err } = await db.rpc("review_request", { req: id, approve: false, reason }));
      if (err) break;
    }
    if (err) return alert(err.message);
    await refresh();
  };
  const remove = async (ids: string[]) => {
    if (!confirm(`${ids.length} अनुरोध स्थायी रूपमा मेट्ने?`)) return;
    const { data: d, error } = await db.from("change_requests").delete().in("id", ids).select("id");
    if (error) return alert(error.message);
    if (!d?.length) return alert("मेटिएन — Supabase मा एडमिनलाई change_requests delete गर्ने अनुमति चाहिन्छ (migration.sql हेर्नुहोस्)।");
    await refresh();
  };
  const saveUser = async (u: VProfile, roles: string[], pos: string) => {
    let { error: err } = await db.rpc("set_roles", { target: u.id, new_roles: roles });
    if (!err) ({ error: err } = await db.rpc("set_position", { target: u.id, p_person: pos || null }));
    if (err) return alert(err.message);
    await refresh();
  };

  const revN = adm ? reviewCount(reviewIssues(g.people)) : 0;
  const sections: Record<Sec, [string, number]> = {
    new: ["🆕 नयाँ सदस्य", pend.length],
    mem: ["🛡 सदस्य भूमिका", mem.length],
    req: ["📨 परिवर्तन अनुरोध", groups.length],
    rev: ["🧭 सम्बन्ध समीक्षा", revN],
    hist: ["🕘 अनुरोध इतिहास", hist.length],
  };

  const CATS: [string, string][] = [["all", "सबै"], ["add", "➕ थप्ने"], ["update", "✏ सच्याउने"], ["delete", "🗑 हटाउने"]];

  let body: React.ReactNode;
  if (cur === "req") {
    body = (
      <>
        <div className="rchips">
          {CATS.map(([k, l]) => (
            <button key={k} className={`ghost ${reqCat === k ? "on" : ""}`} onClick={() => setReqCat(k)}>
              {l} ({np(cn(k))})
            </button>
          ))}
        </div>
        <div className="reqgrid">
          {groups
            .filter((x) => reqCat === "all" || x.items[0].action === reqCat)
            .map((x) => {
              const ids = x.items.map((r) => r.id);
              const r0 = x.items[0];
              return (
                <div className="card req-card" key={ids.join(",")}>
                  <div className="req-content">
                    {x.items.length > 1 && (
                      <>
                        <b>{x.items.length} सन्तान एकैसाथ</b>
                        <hr />
                      </>
                    )}
                    {x.items.map((r, i) => (
                      <React.Fragment key={r.id}>
                        {i > 0 && <hr />}
                        <Req r={r} byId={g.byId} />
                      </React.Fragment>
                    ))}
                    <p className="mut">अनुरोधकर्ता: {r0.profiles?.full_name || r0.profiles?.email}</p>
                  </div>
                  <div className="row">
                    <button onClick={() => approve(ids)}>{x.items.length > 1 ? "सबै स्वीकृत" : "स्वीकृत"}</button>
                    <button className="bad" onClick={() => reject(ids)}>{x.items.length > 1 ? "सबै अस्वीकार" : "अस्वीकार"}</button>
                  </div>
                </div>
              );
            })}
        </div>
      </>
    );
  } else if (cur === "rev") {
    body = <ReviewPanel />;
  } else if (cur === "new") {
    body = <>{pend.map((u) => <UserCard key={u.id} u={u} isNew onSave={saveUser} onAnchor={() => anchorFor(u)} />)}</>;
  } else if (cur === "mem") {
    body = <>{mem.map((u) => <UserCard key={u.id} u={u} isNew={false} onSave={saveUser} onAnchor={() => anchorFor(u)} />)}</>;
  } else {
    const hg: Record<string, ChangeRequest[]> = {};
    hist.forEach((r) => (hg[r.status + ":" + r.action] ||= []).push(r));
    const cats = ["approved", "rejected"].flatMap((s) => ["add", "update", "delete"].map((x) => [s + ":" + x, s, x] as const)).filter(([k]) => hg[k]);
    body = (
      <>
        {okIds.length > 0 && (
          <div className="row" style={{ marginBottom: ".8rem" }}>
            <button className="bad" onClick={() => remove(okIds)}>सबै स्वीकृत इतिहास मेट्ने ({okIds.length})</button>
          </div>
        )}
        {cats.map(([k, s, x]) => {
          const L = hg[k];
          return (
            <details
              className="hcat"
              key={k}
              open={histOpen.includes(k)}
              onToggle={(e) => {
                const o = (e.currentTarget as HTMLDetailsElement).open;
                setHistOpen((h) => (o ? (h.includes(k) ? h : [...h, k]) : h.filter((y) => y !== k)));
              }}
            >
              <summary>
                <span>
                  {s === "approved" ? "✅" : "❌"} {STATUS[s]} · {ACT[x]}
                </span>
                <span className="cnt">{np(L.length)}</span>
              </summary>
              <div className="row" style={{ margin: ".2rem 0 .7rem" }}>
                <button className="bad" onClick={() => remove(L.map((r) => r.id))}>यो वर्गका सबै मेट्ने ({np(L.length)})</button>
              </div>
              <div className="reqgrid hscroll">
                {L.map((r) => (
                  <div className="card" key={r.id}>
                    <Req r={r} byId={g.byId} />
                    <p className="mut">
                      {r.profiles?.full_name || r.profiles?.email}
                      {r.reject_reason ? ` · कारण: ${r.reject_reason}` : ""}
                    </p>
                    <div className="row" style={{ marginTop: ".4rem" }}>
                      <button className="bad" onClick={() => remove([r.id])}>मेट्ने</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </>
    );
  }

  const [ttl, cnt] = sections[cur];
  const empty = cnt === 0 && cur !== "hist" && cur !== "rev";
  return (
    <div className="adm">
      <div className="adm-main">
        <h2>
          {ttl} ({np(cnt)})
        </h2>
        {adm && (
          <div className="row" style={{ margin: "0 0 1rem" }}>
            <button onClick={() => openDialog(<AcctDialog onDone={fetchAll} />)}>➕ खाता बनाउने</button>
            <button className="ghost" onClick={() => openDialog(<AvatarsDialog />)}>🖼 डिफल्ट अवतार</button>
          </div>
        )}
        {empty || (cur === "hist" && !hist.length) ? <div className="card">यहाँ अहिले केही छैन।</div> : body}
      </div>
      <aside className="adm-side" aria-label="एडमिन सेक्सन">
        <h4>सेक्सन</h4>
        {keys.map((k) => (
          <button key={k} className={k === cur ? "on" : ""} onClick={() => setSec(k)}>
            <span>{sections[k][0]}</span>
            <span className="cnt">{np(sections[k][1])}</span>
          </button>
        ))}
      </aside>
    </div>
  );
}
