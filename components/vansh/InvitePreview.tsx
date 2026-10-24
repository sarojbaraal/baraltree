"use client";
// 30-second, read-only look at the invited person's "परिवार" before sign-up.
// The server decides what is returned and for how long (RPC invite_preview, once per link); this only displays it.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createGraph } from "@/lib/vansh/graph";
import { famGroups, relMap } from "@/lib/vansh/relations";
import { dispName, np } from "@/lib/vansh/text";
import type { VPerson, VProfile } from "@/lib/vansh/types";
import { Avatar } from "./ui";
import { useVansh } from "./VanshContext";

interface Reply {
  ok: boolean;
  expired?: boolean;
  seconds_left?: number;
  me_id?: string;
  people?: VPerson[];
}

export default function InvitePreview(props: { token: string; name: string; onDone: () => void }) {
  // above the app header: render outside <main>'s stacking context
  return typeof document === "undefined" ? null : createPortal(<Inner {...props} />, document.body);
}

function Inner({ token, name, onDone }: { token: string; name: string; onDone: () => void }) {
  const { db } = useVansh();
  const [data, setData] = useState<{ people: VPerson[]; me: string; end: number } | null>(null);
  const [left, setLeft] = useState(30);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const done = useRef(onDone);
  done.current = onDone;
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    db.rpc("invite_preview", { p_token: token }).then(({ data: r, error }) => {
      const d = r as Reply | null;
      if (error || !d?.ok || d.expired || !d.people?.length || !d.me_id) return done.current();
      const ids = new Set(d.people.map((p) => p.id));
      const people = d.people.map((p) => ({
        ...p,
        father_id: p.father_id && ids.has(p.father_id) ? p.father_id : null,
        mother_id: p.mother_id && ids.has(p.mother_id) ? p.mother_id : null,
        spouse_id: p.spouse_id && ids.has(p.spouse_id) ? p.spouse_id : null,
        more_spouse_ids: (p.more_spouse_ids || []).filter((x) => ids.has(x)),
      }));
      if (!people.some((p) => p.id === d.me_id)) return done.current();
      setData({ people, me: d.me_id, end: Date.now() + (d.seconds_left ?? 30) * 1000 });
    });
  }, [db, token]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      const s = Math.ceil((data.end - Date.now()) / 1000);
      setLeft(Math.max(0, s));
      if (s <= 0) {
        setData(null); // drop the data from memory
        done.current();
      }
    }, 250);
    return () => clearInterval(t);
  }, [data]);

  const view = useMemo(() => {
    if (!data) return null;
    const g = createGraph(data.people);
    const me = { id: "preview", email: null, full_name: name, role: "member", position_person_id: data.me } as unknown as VProfile;
    const perms = { act: "general", isAdm: false, isStaff: false, seesAll: false, can: () => true, canEdit: () => false, nm: (p: VPerson) => p.name } as never;
    return { g, R: relMap(g, me).R, groups: famGroups(g, me, perms) };
  }, [data, name]);

  if (!data || !view) return <div className="ipv"><div className="ipv-h"><b>पूर्वावलोकन तयार हुँदैछ…</b></div></div>;
  const go = () => {
    setData(null);
    onDone();
  };
  return (
    <div className="ipv" role="dialog" aria-label="परिवारको पूर्वावलोकन">
      <div className="ipv-h">
        <div>
          <b>{name} को परिवार</b>
          <div className="mut">केवल हेर्न मात्र — {np(left)} सेकेन्डपछि खाता बनाउने विन्डो खुल्छ</div>
        </div>
        <button onClick={go}>खाता बनाउनुहोस्</button>
      </div>
      <div className="ipv-bar"><i style={{ width: `${(left / 30) * 100}%` }} /></div>
      <div className="ipv-b">
        {view.groups.filter((gr) => gr.members.length).map((gr, gi) => (
          <details
            className="acc"
            key={gi}
            open={open.has(gi)}
            onToggle={(e) => {
              const o = (e.currentTarget as HTMLDetailsElement).open;
              setOpen((s) => {
                if (s.has(gi) === o) return s;
                const n = new Set(s);
                if (o) n.add(gi); else n.delete(gi);
                return n;
              });
            }}
          >
            <summary><span className="acc-t">{gr.title}</span><span className="acc-n">{np(gr.members.length)}</span></summary>
            <div className="acc-b">
              <div className="cgrid">
                {gr.members.map((p) => (
                  <div key={p.id} className={`mc g${p.gender || "O"} ${p.is_living ? "" : "dead"} ${p.id === data.me ? "mine" : ""}`} tabIndex={0} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}>
                    <div className="mav2"><Avatar g={p.gender} photo={p.photo_url} live={p.is_living} /></div>
                    <div className="mn">{dispName(p, true)}</div>
                    <div className="my">{view.R[p.id] || ""}</div>
                    {p.id === data.me ? <span className="me">तपाईं</span> : null}
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
