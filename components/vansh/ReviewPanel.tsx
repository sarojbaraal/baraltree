"use client";
// Admin "सम्बन्ध समीक्षा": data problems that make kinship words wrong or missing, grouped, fixable in one click.
import React, { useMemo, useState } from "react";
import { KIND_LABEL, KIND_ORDER, reviewIssues, type Issue, type IssueKind } from "@/lib/vansh/review";
import { dispName, np } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";
import { PersonForm } from "./PersonDialogs";

const LS = "vv_rev_ignore";
const loadIgnored = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(LS) || "[]");
  } catch {
    return [];
  }
};

export function reviewCount(issues: Issue[]) {
  return issues.filter((i) => i.level !== "info").length;
}

export default function ReviewPanel() {
  const { g, pick, openDialog } = useVansh();
  const all = useMemo(() => reviewIssues(g.people), [g.people]);
  const [ignored, setIgnored] = useState<string[]>(loadIgnored);
  const [kind, setKind] = useState<IssueKind | "all">("all");
  const [showIgnored, setShowIgnored] = useState(false);
  const [openAll, setOpenAll] = useState<Record<string, boolean>>({});

  const save = (v: string[]) => {
    setIgnored(v);
    try {
      localStorage.setItem(LS, JSON.stringify(v));
    } catch {}
  };
  const live = all.filter((i) => !ignored.includes(i.key));
  const shown = (showIgnored ? all.filter((i) => ignored.includes(i.key)) : live).filter((i) => kind === "all" || i.kind === kind);
  const cnt = (k: IssueKind | "all") => live.filter((i) => k === "all" || i.kind === k).length;
  const errors = live.filter((i) => i.level === "error").length;
  const warns = live.filter((i) => i.level === "warn").length;

  return (
    <>
      <div className="rv-sum">
        <div className={errors ? "bad" : "ok"}><b>{np(errors)}</b><span>गल्ती (नाता गलत आउँछ)</span></div>
        <div className={warns ? "warn" : "ok"}><b>{np(warns)}</b><span>शंकास्पद</span></div>
        <div><b>{np(g.people.length)}</b><span>जाँचिएका सदस्य</span></div>
      </div>
      <div className="rchips">
        <button className={`ghost ${kind === "all" ? "on" : ""}`} onClick={() => setKind("all")}>सबै ({np(cnt("all"))})</button>
        {KIND_ORDER.filter((k) => cnt(k) > 0).map((k) => (
          <button key={k} className={`ghost ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]} ({np(cnt(k))})
          </button>
        ))}
        {ignored.length > 0 && (
          <button className={`ghost ${showIgnored ? "on" : ""}`} onClick={() => setShowIgnored((s) => !s)}>
            🙈 बेवास्ता ({np(ignored.length)})
          </button>
        )}
      </div>
      {!shown.length ? (
        <div className="card">{showIgnored ? "बेवास्ता गरिएका केही छैन।" : "✅ कुनै समस्या भेटिएन। नाताका शब्द भरपर्दो छन्।"}</div>
      ) : (
        <div className="rv-list">
          {shown.map((i) => {
            const many = i.ids.length > 6 && !openAll[i.key];
            const ids = many ? i.ids.slice(0, 6) : i.ids;
            const first = g.byId[i.ids[0]];
            return (
              <div key={i.key} className={`card rv ${i.level}`}>
                <div className="rv-h">
                  <span className="rv-k">{KIND_LABEL[i.kind]}</span>
                  <span className={`rv-lv ${i.level}`}>{i.level === "error" ? "गल्ती" : i.level === "warn" ? "शंका" : "सूचना"}</span>
                </div>
                <b>{i.title}</b>
                <p className="mut">{i.detail}</p>
                <div className="rv-people">
                  {ids.map((id) => g.byId[id] && (
                    <button key={id} className="ghost" onClick={() => pick(id)}>{dispName(g.byId[id], true)}{g.byId[id].birth_bs ? ` · ${g.byId[id].birth_bs}` : ""}</button>
                  ))}
                  {many && <button className="ghost" onClick={() => setOpenAll((o) => ({ ...o, [i.key]: true }))}>+{np(i.ids.length - 6)} थप</button>}
                </div>
                <div className="row">
                  {first && i.kind !== "nodate" && (
                    <button onClick={() => openDialog(<PersonForm action="update" p={first} />, true)}>✏ {dispName(first, true)} सच्याउने</button>
                  )}
                  {showIgnored ? (
                    <button className="ghost" onClick={() => save(ignored.filter((k) => k !== i.key))}>↩ फेरि देखाउने</button>
                  ) : (
                    <button className="ghost" onClick={() => save([...ignored, i.key])}>यो ठीक छ, बेवास्ता</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
