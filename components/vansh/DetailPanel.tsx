"use client";
// Profile side panel (FamilySearch-style) — ported from the original app.js detail().
import React, { useState } from "react";
import { relMap, relsOf, genNo } from "@/lib/vansh/relations";
import { ageN, fbOk, np, yr } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";
import { AddMenu, DeleteDialog, InviteDialog, PersonForm } from "./PersonDialogs";

function Box({ c, ic, l, children }: { c: string; ic: string; l: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="ib w" style={{ ["--c" as string]: c }}>
      <span className="ii">{ic}</span>
      <div>
        <small>{l}</small>
        <b>{children}</b>
      </div>
    </div>
  );
}

export default function DetailPanel({
  depthOf, onGo, onPrint, top,
}: {
  /** Distance from the viewport top (below the header) when the panel is docked beside the page. */
  top?: number;
  depthOf?: (id: string) => number | undefined;
  /** Called when a relative is clicked (tree view unfolds + glides there). */
  onGo?: (id: string) => void;
  onPrint?: (id: string) => void;
}) {
  const { db, g, me, sel, perms, pick, unpick, openDialog, toast, reload, send } = useVansh();
  const [more, setMore] = useState(false);
  const [busyAi, setBusyAi] = useState(false);
  const p = sel ? g.byId[sel] : undefined;
  if (!p) return null;

  const { can, canEdit, isAdm, isStaff, nm } = perms;
  const ce = canEdit(p.id);
  const lim = !!p.name_only;
  const rl = relMap(g, me).R[p.id];
  const RL: { q: typeof p; l: string; self?: boolean }[] = relsOf(g, p);
  RL.splice(RL.filter((x) => x.l === "बुबा" || x.l === "आमा").length, 0, { q: p, l: "यही प्रोफाइल", self: true });
  const age = p.is_living || p.death_bs ? ageN(p.birth_bs, p.is_living ? "" : p.death_bs) : null;

  const aiSummary = async () => {
    setBusyAi(true);
    toast("🤖 AI ले विश्लेषण गर्दैछ...");
    try {
      const { data, error } = await db.functions.invoke("generate-ai-insights", {
        body: {
          action: "summarize",
          person: { name: p.name, gender: p.gender, birth_bs: p.birth_bs, death_bs: p.death_bs, is_living: p.is_living, birth_place: p.birth_place, notes: p.notes },
          family_context: {
            father: (p.father_id && g.byId[p.father_id]?.name) || "अज्ञात",
            mother: (p.mother_id && g.byId[p.mother_id]?.name) || "अज्ञात",
            spouse: p.spouse_id ? g.byId[p.spouse_id]?.name : "अज्ञात",
          },
        },
      });
      if (error) throw error;
      const e = await send("update", p.id, { ai_summary: data.summary, ai_tags: data.tags }, "");
      if (e) throw new Error(e);
      toast("✅ AI सारांश सुरक्षित भयो!");
      await reload();
    } catch (err) {
      toast("❌ AI असफल: " + (err as Error).message);
    } finally {
      setBusyAi(false);
    }
  };

  return (
    <aside id="det" style={top ? { top } : undefined}>
      <div className="pp-fix">
        <button className="ghost pp-x" id="dx" aria-label="बन्द" onClick={unpick}>×</button>
        <div className="pp-top">
          <div
            className={`pp-av g${p.gender || "O"}`}
            style={p.photo_url ? { backgroundImage: `url('${p.photo_url}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {!p.photo_url && <Avatar g={p.gender} />}
          </div>
          <div className="pp-info">
            <h3>{p.name}</h3>
            {rl && <div className="pp-l">💠 {rl === "तपाईं" ? "तपाईं" : "तपाईंको " + rl}</div>}
            <div className="pp-l">
              🧬 Gen {np(genNo(g, p.id, depthOf))}
              {age != null ? " · उमेर " + np(age) + " वर्ष" : ""}
              {p.is_living ? "" : " · दिवंगत"}
            </div>
            {g.addrOf(p) && <div className="pp-l">📍 {g.addrOf(p)}</div>}
          </div>
        </div>
        {!lim && (
          <div className="pp-act">
            <button onClick={() => document.getElementById("pi")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              <i>🪪</i>Profile
            </button>
            {ce && (
              <>
                <button onClick={() => openDialog(<PersonForm action="update" p={p} />, true)}>
                  <i>✏️</i>
                  {isAdm ? "Edit" : "Edit (अनुरोध)"}
                </button>
                <button onClick={() => openDialog(<AddMenu p={p} />)}><i>➕</i>Add</button>
                <button onClick={() => setMore((m) => !m)}><i>⋯</i>More</button>
              </>
            )}
            {onPrint && (
              <button style={{ marginLeft: "auto", background: "var(--bg-2)" }} onClick={() => onPrint(p.id)}>
                <i>🖨️</i> शाखा प्रिन्ट
              </button>
            )}
            {isAdm && (
              <button
                disabled={busyAi}
                style={{ marginLeft: "0.5rem", background: "linear-gradient(135deg, #8B5CF6, #EC4899)", color: "white", border: "none" }}
                onClick={aiSummary}
              >
                <i>✨</i> AI Summary
              </button>
            )}
          </div>
        )}
      </div>
      {ce && !lim && more && (
        <div id="pmore">
          {isAdm && <button onClick={() => openDialog(<InviteDialog p={p} />)}>🔗 निम्तो लिंक</button>}
          <button className="bad" onClick={() => openDialog(<DeleteDialog p={p} />)}>
            {isAdm ? "🗑 हटाउने" : "🗑 हटाउने अनुरोध"}
          </button>
        </div>
      )}
      {lim ? (
        <p className="mut" style={{ marginTop: "1rem" }}>यो शाखाको नाम मात्र हेर्न मिल्छ।</p>
      ) : (
        <>
          <div className="pp-h">तत्काल परिवार</div>
          {RL.length ? (
            RL.map(({ q, l, self }) => {
              const ok = can(q.id);
              return (
                <div
                  key={q.id + l}
                  className={`fr ${ok ? "" : "locked"} ${self ? "hl" : ""}`}
                  onClick={() => {
                    if (!ok || self) return;
                    if (onGo) onGo(q.id);
                    pick(q.id);
                  }}
                >
                  <div className={`mav2 sm g${q.gender || "O"}`}>{ok ? <Avatar g={q.gender} /> : "🔒"}</div>
                  <div>
                    <b>{nm(q)}</b>
                    <small>
                      {l}
                      {ok && yr(q.birth_bs) ? " · " + yr(q.birth_bs) : ""}
                    </small>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="mut">कुनै नाता जोडिएको छैन।</p>
          )}
          <div className="pp-h" id="pi">व्यक्तिगत विवरण</div>
          <Box c="#F59E0B" ic="🎂" l="जन्म मिति (BS)">{p.birth_bs}</Box>
          {!p.is_living && <Box c="#6B7280" ic="🕊" l="मृत्यु मिति (BS)">{p.death_bs}</Box>}
          {p.gender === "F" && (
            <>
              <Box c="#EC4899" ic="👰" l="विवाहअघिको थर">{p.maiden_name}</Box>
              <Box c="#EF4444" ic="💍" l="विवाहपछिको थर">{p.married_name}</Box>
            </>
          )}
          <Box c="#F59E0B" ic="📌" l="जन्म स्थान">{p.birth_place}</Box>
          <Box c="#14B8A6" ic="📞" l="फोन">{p.phone}</Box>
          {(isStaff || p.id === me?.position_person_id) && <Box c="#3B82F6" ic="✉️" l="इमेल (लगइन)">{p.email}</Box>}
          <Box c="#8B5CF6" ic="📍" l="ठेगाना">{g.addrOf(p)}</Box>
          {fbOk(p.facebook) && (
            <Box c="#1877F2" ic="🔗" l="Facebook">
              <a href={p.facebook!} target="_blank" rel="noopener noreferrer">प्रोफाइल खोल्नुहोस्</a>
            </Box>
          )}
          <Box c="#D97706" ic="📝" l="टिप्पणी">{p.notes}</Box>
          {p.ai_summary && (
            <>
              <div className="pp-h">✨ AI सारांश</div>
              <div className="ib w" style={{ ["--c" as string]: "#8B5CF6" }}>
                <span className="ii">🤖</span>
                <div>
                  <small>AI विश्लेषण</small>
                  <p style={{ margin: "0.5rem 0 0", lineHeight: 1.5, fontSize: "0.9rem" }}>{p.ai_summary}</p>
                  {!!p.ai_tags?.length && (
                    <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      {p.ai_tags.map((t) => (
                        <span key={t} style={{ background: "var(--acc-glow)", color: "var(--acc)", padding: "0.2rem 0.6rem", borderRadius: 99, fontSize: "0.75rem", fontWeight: 600 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
