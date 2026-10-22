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
      <p className="mut rv-intro">यहाँ तपाईंको वंशावलीका ती डेटा-गल्ती देखिन्छन् जसले नाताका शब्द (दाजु/भाइ, काका, मामा, जेठो/कान्छो …) गलत वा खाली बनाउँछन्। हरेक कार्डमा समस्या, असर र सच्याउने तरिका छ — ❗ चिह्न भएको सदस्यबाट सुरु गर्नुहोस्।</p>
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
            const lim = 8;
            const rows = i.rows.length > lim && !openAll[i.key] ? i.rows.slice(0, lim) : i.rows;
            const lvl = i.level === "error" ? "गल्ती — नाता गलत आउँछ" : i.level === "warn" ? "शंकास्पद — जाँच्नुहोस्" : "सूचना — डेटा अधुरो";
            return (
              <details key={i.key} className={`card rv ${i.level}`} open={i.level !== "info"}>
                <summary>
                  <span className={`rv-lv ${i.level}`}>{lvl}</span>
                  <span className="rv-k">{KIND_LABEL[i.kind]}</span>
                  <b>{i.title}</b>
                </summary>
                <div className="rv-body">
                  <div className="rv-blk"><h5>समस्या</h5><p>{i.detail}</p></div>
                  <div className="rv-blk"><h5>किन फरक पर्छ</h5><p>{i.impact}</p></div>
                  <div className="rv-blk">
                    <h5>कसरी सच्याउने</h5>
                    <ol>{i.steps.map((st, n) => <li key={n}>{st}</li>)}</ol>
                  </div>
                  <table className="rv-tbl">
                    <thead><tr><th>सदस्य</th><th>भूमिका</th><th>अहिले</th><th /></tr></thead>
                    <tbody>
                      {rows.map((r) => {
                        const pp = g.byId[r.id];
                        if (!pp) return null;
                        return (
                          <tr key={r.id} className={r.fix ? "fx" : ""}>
                            <td><button className="rv-nm" onClick={() => pick(r.id)}>{dispName(pp, true)}</button></td>
                            <td className="mut">{r.role}</td>
                            <td>{r.fix && <span className="rv-flag">❗</span>} {r.note}</td>
                            <td><button className={r.fix ? "" : "ghost"} onClick={() => openDialog(<PersonForm action="update" p={pp} />, true)}>✏ सच्याउने</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {i.rows.length > lim && !openAll[i.key] && (
                    <button className="ghost rv-more" onClick={() => setOpenAll((o) => ({ ...o, [i.key]: true }))}>
                      बाँकी {np(i.rows.length - lim)} जना देखाउने
                    </button>
                  )}
                  <div className="rv-foot">
                    {showIgnored ? (
                      <button className="ghost" onClick={() => save(ignored.filter((k) => k !== i.key))}>↩ फेरि देखाउने</button>
                    ) : (
                      <button className="ghost" onClick={() => save([...ignored, i.key])}>यो ठीक छ — बेवास्ता गर्ने</button>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
