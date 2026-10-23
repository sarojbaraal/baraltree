"use client";
// Download / import entry (shown in the Family section). The button opens one window that explains every option.
import React, { useEffect, useRef, useState } from "react";
import { computeLayout } from "@/lib/vansh/layout";
import { exportJPG, exportJSON, exportCSV, exportSVG, exportXLSX, svgText } from "@/lib/vansh/exporters";
import { exportMainXLSX, nearGraph } from "@/lib/vansh/exportMain";
import { allPdf, type Paper } from "@/lib/vansh/branchPrint";
import { diffImport, parseImportRows, readImportFile } from "@/lib/vansh/importer";
import { useVansh } from "./VanshContext";
import { ImportPreview } from "./AdminDialogs";
import { np } from "@/lib/vansh/text";

function Opt({ icon, title, info, children, disabled }: { icon: string; title: string; info: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div className={"dlopt" + (disabled ? " off" : "")}>
      <div className="dlo-h"><span aria-hidden>{icon}</span> <b>{title}</b></div>
      <p className="mut">{info}</p>
      <div className="row">{children}</div>
    </div>
  );
}

export function DownloadDialog() {
  const { g, perms, myPosId, closeDialog, openDialog, toast } = useVansh();
  const { can, nm, isAdm, isStaff } = perms;
  const [busy, setBusy] = useState("");
  const [paper, setPaper] = useState<Paper>("a3");
  const run = async (key: string, fn: () => Promise<unknown> | unknown, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      alert((e as Error).message || String(e));
    } finally {
      setBusy("");
    }
  };
  const full = () => computeLayout(g, new Set());
  const near = () => {
    if (!myPosId || !g.byId[myPosId]) throw new Error("तपाईंको स्थान वंशावलीमा तोकिएको छैन — एडमिनले स्थान तोकेपछि यो चल्छ।");
    const ng = nearGraph(g, myPosId);
    return computeLayout(ng, new Set());
  };
  return (
    <div className="dlw">
      <h3>⇩ वंशावली डाउनलोड</h3>
      <p className="mut">तपाईंले हेर्न पाउने व्यक्तिहरूको मात्र डाटा आउँछ। बन्द (locked) शाखा समावेश हुँदैन।</p>

      <Opt icon="📷" title="फोटो (JPG)" info={<>चार्ट ठूलो हुँदा फोटोको गुणस्तर स्पष्ट नहुने भएकाले यसमा तपाईंको स्थानभन्दा २ पुस्ता माथि र २ पुस्ता तल (सिधा लाइन र पति/पत्नी) मात्र आउँछ। फोन/कम्प्युटरको ग्यालरीमा हेर्न मिल्छ।</>}>
        <button disabled={!!busy} onClick={() => run("jpg", () => { const l = near(); return exportJPG(svgText(l, can, nm), l.W, l.H); })}>{busy === "jpg" ? "…" : "फोटो डाउनलोड"}</button>
      </Opt>

      <Opt icon="🖼" title="SVG चित्र" info={<>उच्च गुणस्तरको चित्र, जतिसुकै ठूलो गर्दा पनि स्पष्ट रहन्छ। Chrome/Safari वा कुनै SVG viewer एपमा खोल्नुहोस्। तपाईंले हेर्न पाउने सबै व्यक्ति समावेश हुन्छन्।</>}>
        <button disabled={!!busy} onClick={() => run("svg", () => exportSVG(svgText(full(), can, nm)))}>SVG डाउनलोड</button>
      </Opt>

      <Opt icon="📄" title="PDF" info={<>तपाईंले हेर्न पाउने सबै व्यक्ति पुस्ता-तहमा मिलाएर (ठाडो झरना ढाँचा) कागज साइज अनुसार स्तम्भमा बाँडिन्छ। धेरै जना भए पृष्ठ बढ्छ।</>}>
        <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="कागज साइज">
          <option value="a4">A4</option>
          <option value="a3">A3</option>
          <option value="a2">A2</option>
        </select>
        <button disabled={!!busy} onClick={() => run("pdf", async () => {
          const out = await allPdf(g, can, nm, paper);
          const a = document.createElement("a");
          a.href = URL.createObjectURL(out.blob);
          a.download = `vanshavali-${paper.toUpperCase()}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          return out.pages;
        }, "PDF तयार भयो")}>{busy === "pdf" ? "बन्दैछ…" : "PDF डाउनलोड"}</button>
      </Opt>

      <Opt icon="📊" title="Excel (.xlsx)" info={<>स्तम्भ: नाम, हजुरबुबा, बुबा, आमा, जन्म मिति, जन्म स्थान, ठेगाना, शिक्षा, पेशा, वैवाहिक अवस्था, पति/पत्नी, सम्पर्क नम्बर, email, facebook link, टिप्पणी। {isStaff ? "तपाईं एडमिन/मोडरेटर हुनुहुन्छ — सबैको फोन/इमेल आउँछ।" : "फोन/इमेल तपाईंको आफ्नो पङ्क्तिमा मात्र आउँछ।"} (वैवाहिक अवस्था पति/पत्नीको विवरणबाट निकालिन्छ।)</>}>
        <button disabled={!!busy} onClick={() => run("xlsx", () => exportMainXLSX(g, { can, isStaff, myPosId }).then((n) => toast(`${np(n)} जनाको Excel तयार भयो`)))}>Excel डाउनलोड</button>
      </Opt>

      {isAdm && (
        <Opt icon="🔁" title="आयात / निर्यात" info="पूर्ण ब्याकअप (JSON/CSV) र फाइलबाट डाटा अपलोड। एडमिनका लागि।">
          <button className="ghost" onClick={() => openDialog(<ImportExportDialog />)}>विन्डो खोल्ने</button>
        </Opt>
      )}
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button className="ghost" onClick={closeDialog}>बन्द</button>
      </div>
    </div>
  );
}

/** Admin: full backup + upload with preview. */
export function ImportExportDialog() {
  const { db, g, people, openDialog, closeDialog, reload } = useVansh();
  const fileRef = useRef<HTMLInputElement>(null);
  const doImport = async (f: File) => {
    try {
      const raw = await readImportFile(f);
      const parsed = parseImportRows(g, raw);
      const kept = people.filter((p) => !parsed.rows.some((o) => o.id === p.id)).length;
      const diff = diffImport(g, parsed.rows);
      const ok = await new Promise<boolean>((res) =>
        openDialog(<ImportPreview diff={diff} kept={kept} dateWarn={parsed.dateWarn} onResolve={res} />)
      );
      closeDialog();
      if (!ok) return;
      const { data, error } = await db.rpc("import_people", { payload: parsed.rows });
      if (error) throw error;
      alert(`${data} व्यक्ति आयात भयो।`);
      await reload();
    } catch (er) {
      alert("आयात भएन: " + ((er as Error).message || er));
    }
  };
  return (
    <div className="dlw">
      <h3>🔁 आयात / निर्यात</h3>
      <p className="mut">आयात गर्नुअघि JSON ब्याकअप लिनुहोस्। फाइलमा नभएका व्यक्ति हटाइँदैनन्। अपलोड गरेपछि फरक देखाउने पूर्वावलोकन आउँछ, पुष्टि गरेपछि मात्र लागू हुन्छ।</p>
      <div className="row">
        <button className="ghost" onClick={() => exportXLSX(g).catch((e) => alert(e.message))}>📊 पूर्ण Excel</button>
        <button className="ghost" onClick={() => exportCSV(g)}>📄 CSV</button>
        <button className="ghost" onClick={() => exportJSON(people)}>💾 JSON ब्याकअप</button>
      </div>
      <div className="row" style={{ marginTop: ".8rem" }}>
        <button onClick={() => fileRef.current?.click()}>📥 फाइल अपलोड</button>
        <button className="ghost" onClick={closeDialog}>बन्द</button>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

export default function DownloadMenu() {
  const { perms, openDialog } = useVansh();
  const open = () => openDialog(<DownloadDialog />);
  useEffect(() => {
    const h = () => open();
    window.addEventListener("vv-open-download", h);
    return () => window.removeEventListener("vv-open-download", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <details className="menu">
      <summary onClick={(e) => { e.preventDefault(); open(); }}>{perms.isAdm ? "⇩ डाउनलोड" : "⇩ बंशावली डाउनलोड"}</summary>
    </details>
  );
}
