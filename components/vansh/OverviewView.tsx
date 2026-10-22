"use client";
// "Family Overview" (staff only): donut / bar statistics. Ported from the original app.js ovView().
import React, { useMemo, useState } from "react";
import type { Graph } from "@/lib/vansh/graph";
import { myPos } from "@/lib/vansh/graph";
import { relMap } from "@/lib/vansh/relations";
import { bsYear, np, yr } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";

const PAL = ["#3B82F6", "#EC4899", "#F59E0B", "#14B8A6", "#8B5CF6", "#EF4444", "#6B7280"];
type Data = [string, string[]][];

const LV = [
  "",
  "👫 दाजुभाइ-दिदीबहिनी र तिनका सन्तान (साझा बुबा/आमा)",
  "🏠 काका/फुपू/ठूलोबुबा परिवार (साझा हजुरबुबा)",
  "🌳 साझा हजुरबुबाका बुबा",
];

/** Groups the pool by how they relate to `base` (shared ancestors, spouse, descendants…). */
export function ovGroups(g: Graph, pool: VPerson[], base: VPerson): Data {
  const A = g.ancUp(base.id);
  const G: Record<string, string[]> = {};
  const sps = new Set(g.spousesOf(base));
  const add = (k: string, id: string) => (G[k] ||= []).push(id);
  pool.forEach((x) => {
    if (x.id === base.id) return add("🙋 तपाईं", x.id);
    if (A[x.id] !== undefined) return add("⬆ सीधा पुर्खा", x.id);
    const Ax = g.ancUp(x.id);
    if (Ax[base.id] !== undefined) return add("⬇ आफ्नै सन्तान", x.id);
    if (sps.has(x.id)) return add("💞 पति/पत्नी", x.id);
    let k: number | null = null;
    Object.keys(Ax).forEach((i) => {
      if (A[i] !== undefined && (k === null || A[i] < k)) k = A[i];
    });
    if (k === null)
      return add(
        g.spousesOf(x).some((s) => Object.keys(g.ancUp(s)).some((i) => A[i] !== undefined))
          ? "🔗 विवाह सम्बन्धबाट आएका"
          : "🌐 साझा पुर्खा नभएका",
        x.id
      );
    add(LV[k] || "🌲 टाढाको साझा पुर्खा", x.id);
  });
  return Object.entries(G);
}

const AGE_BUCKETS = ["०-९", "१०-१९", "२०-२९", "३०-३९", "४०-४९", "५०-५९", "६०-६९", "७०-७९", "८०+"];
export function ageBuckets(pool: VPerson[], now: number): Data {
  const B: Record<string, string[]> = Object.fromEntries(AGE_BUCKETS.map((k) => [k, []]));
  const unk: string[] = [];
  pool.forEach((p) => {
    const b = parseInt(yr(p.birth_bs));
    const e = p.is_living ? now : parseInt(yr(p.death_bs));
    if (!b || !e || e < b) return void unk.push(p.id);
    B[AGE_BUCKETS[Math.min(8, Math.floor((e - b) / 10))]].push(p.id);
  });
  const ag: Data = Object.entries(B);
  if (unk.length) ag.push(["वर्ष नभएका", unk]);
  return ag;
}

function Donut({ title, data, onPick }: { title: string; data: Data; onPick: (t: string, l: string, ids: string[]) => void }) {
  const T = data.reduce((a, d) => a + d[1].length, 0) || 1;
  const R = 40;
  const C = 2 * Math.PI * R;
  let o = 0;
  return (
    <div className="card ovc">
      <h3>{title}</h3>
      <div className="ovd">
        <svg viewBox="0 0 120 120" width="150" height="150">
          <circle r="40" cx="60" cy="60" fill="none" stroke="var(--line)" strokeWidth="20" />
          {data.map(([l, ids], i) => {
            const n = (ids.length / T) * C;
            const el = (
              <circle
                key={l}
                className="ovx"
                r={R}
                cx="60"
                cy="60"
                fill="none"
                stroke={PAL[i % 7]}
                strokeWidth="20"
                strokeDasharray={`${n} ${C - n}`}
                strokeDashoffset={-o}
                transform="rotate(-90 60 60)"
                onClick={() => onPick(title, l, ids)}
              />
            );
            o += n;
            return el;
          })}
          <text x="60" y="66" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">
            {np(T)}
          </text>
        </svg>
        <ul className="ovl">
          {data.map(([l, ids], i) => (
            <li className="ovx" key={l} onClick={() => onPick(title, l, ids)}>
              <i style={{ background: PAL[i % 7] }} />
              {l} <b>{np(ids.length)}</b> <span className="mut">({np(Math.round((ids.length / T) * 100))}%)</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Bars({ title, data, note, onPick }: { title: string; data: Data; note?: string; onPick: (t: string, l: string, ids: string[]) => void }) {
  const M = Math.max(1, ...data.map((d) => d[1].length));
  return (
    <div className="card ovc">
      <h3>{title}</h3>
      {data.map(([l, ids], i) => (
        <div className="ovb ovx" key={l} onClick={() => onPick(title, l, ids)}>
          <span>{l}</span>
          <div>
            <i style={{ width: `${(ids.length / M) * 100}%`, background: PAL[i % 7] }} />
          </div>
          <b>{np(ids.length)}</b>
        </div>
      ))}
      {note && <p className="mut">{note}</p>}
    </div>
  );
}

export default function OverviewView() {
  const { g, me, perms, setTab, pick } = useVansh();
  const [list, setList] = useState<{ t: string; l: string; ids: string[] } | null>(null);
  const pool = useMemo(() => g.people.filter((p) => perms.can(p.id)), [g, perms]);
  const R = useMemo(() => relMap(g, me).R, [g, me]);
  const f = (fn: (p: VPerson) => boolean) => pool.filter(fn).map((p) => p.id);
  const base = (myPos(me) && g.byId[myPos(me) as string]) || null;
  const nz = (d: Data) => d.filter((x) => x[1].length);
  const onPick = (t: string, l: string, ids: string[]) => setList({ t, l, ids });

  return (
    <>
      <div className="row" style={{ margin: "0 0 1rem" }}>
        <button className="ghost" onClick={() => setTab("fam")}>← परिवार</button>
      </div>
      <h2>
        📊 Family Overview <small className="mut">{np(pool.length)} सदस्य · कुनै भागमा क्लिक गर्नुहोस्</small>
      </h2>
      {list && (
        <div className="card hscroll" id="ovlist">
          <h3>
            {list.t} → {list.l} <small className="mut">({np(list.ids.length)})</small>
          </h3>
          {list.ids.length ? (
            list.ids
              .map((id) => g.byId[id])
              .filter(Boolean)
              .sort(g.byBirth)
              .map((p) => (
                <div className="fr" key={p.id} onClick={() => pick(p.id)}>
                  <div className={`mav2 sm g${p.gender || "O"}`}><Avatar g={p.gender} photo={p.photo_url} /></div>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {R[p.id] || ""}
                      {yr(p.birth_bs) ? " · " + yr(p.birth_bs) : ""}
                    </small>
                  </div>
                </div>
              ))
          ) : (
            <p className="mut">कोही छैन।</p>
          )}
        </div>
      )}
      <div className="ovgrid">
        <Donut
          title="१. लिङ्ग"
          onPick={onPick}
          data={nz([["पुरुष", f((p) => p.gender === "M")], ["महिला", f((p) => p.gender === "F")], ["अन्य/नतोकिएको", f((p) => p.gender !== "M" && p.gender !== "F")]])}
        />
        <Donut title="२. जीवित तथा दिवंगत" onPick={onPick} data={nz([["जीवित", f((p) => p.is_living)], ["दिवंगत", f((p) => !p.is_living)]])} />
        <Donut
          title="३. वैवाहिक स्थिति"
          onPick={onPick}
          data={nz([["विवाहित", f((p) => g.spousesOf(p).length > 0)], ["अविवाहित/अज्ञात", f((p) => !g.spousesOf(p).length)]])}
        />
        {base ? (
          <Bars title="४. म सँग साझा पुर्खा भएका (नाता अनुसार)" data={ovGroups(g, pool, base)} onPick={onPick} />
        ) : (
          <div className="card ovc">
            <h3>४. साझा पुर्खा</h3>
            <p className="mut">तपाईंको स्थान तोकिएपछि यो चार्ट देखिन्छ।</p>
          </div>
        )}
        <Bars title="५. उमेर वितरण (वर्ष)" data={ageBuckets(pool, bsYear())} note="उमेर = BS वर्षको अन्तर (अनुमानित)।" onPick={onPick} />
      </div>
    </>
  );
}
