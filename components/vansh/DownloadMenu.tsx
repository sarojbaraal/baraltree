"use client";
// Download / import entry (shown in the Family section). The button opens one window that explains every option.
import React, { useMemo, useRef, useState } from "react";
import { exportJSON, exportCSV, exportXLSX, jpgBlob, loadPhotos, svgBlob } from "@/lib/vansh/exporters";
import { bestLayout, posterSvg, svgSize } from "@/lib/vansh/poster";
import { mainXlsxBlob, nearGraph } from "@/lib/vansh/exportMain";
import { allPrint, type Paper } from "@/lib/vansh/branchPrint";
import { DownloadPreview, useStampMaker, type Prepared } from "./DownloadPreview";
import { BRAND } from "@/lib/vansh/notice";
import { diffImport, parseImportRows, readImportFile } from "@/lib/vansh/importer";
import { useVansh } from "./VanshContext";
import { ImportPreview } from "./AdminDialogs";
import { np } from "@/lib/vansh/text";
import { buildTemplate, parseTemplate, templateName, type NewPersonDraft, type TemplateParse } from "@/lib/vansh/template";
import { download, stamp } from "@/lib/vansh/exporters";
import { guardRequest, makeRequest } from "@/lib/vansh/requests";
import { createGraph, premiumGrand } from "@/lib/vansh/graph";

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
  const { g: gAll, me, db, perms, myPosId, closeDialog, openDialog, toast } = useVansh();
  const { can, nm, isAdm, isStaff } = perms;
  // one basis for printing: बंशज print what lies below their own grandfather; moderators and admin print what they can see
  const g = useMemo(() => {
    if (perms.act !== "premium") return gAll;
    const gr = me ? premiumGrand(gAll, me) : null;
    const set = gr ? gAll.downSet(gr.id) : new Set<string>();
    return createGraph(gAll.people.filter((p) => set.has(p.id)));
  }, [gAll, me, perms.act]);
  // the wall chart: everyone below the member's own grandfather, with photos (children included)
  const wall = useMemo(() => {
    const gr = me ? premiumGrand(gAll, me) : null;
    if (!gr) return null;
    const set = gAll.downSet(gr.id);
    const wg = createGraph(gAll.people.filter((p) => set.has(p.id) && !p.is_locked));
    return { root: gr, g: wg };
  }, [gAll, me]);
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
  const mkStamp = useStampMaker();
  const prep = (key: string, fn: () => Promise<Prepared>) =>
    run(key, async () => {
      const data = await fn();
      db.rpc("log_print", { p_scope: `${key}|${perms.act}|${g.people.length}` }).then(() => {}, () => {});
      openDialog(<DownloadPreview data={data} onCancel={() => openDialog(<DownloadDialog />)} />);
    });
  const full = () => bestLayout(g, 420, 297);
  const near = () => {
    if (!myPosId || !g.byId[myPosId]) throw new Error("तपाईंको स्थान वंशावलीमा तोकिएको छैन — एडमिनले स्थान तोकेपछि यो चल्छ।");
    const ng = nearGraph(g, myPosId);
    return bestLayout(ng, 420, 297);
  };
  return (
    <div className="dlw">
      <h3>⇩ वंशावली डाउनलोड</h3>
      <p className="mut">{perms.act === "premium" ? "तपाईंको हजुरबुबादेखि तलको शाखा मात्र आउँछ।" : "तपाईंले हेर्न पाउने व्यक्तिहरूको मात्र डाटा आउँछ। बन्द (locked) शाखा समावेश हुँदैन।"}</p>

      {perms.act === "general" ? (
        <p className="card">छाप्ने र डाउनलोड गर्ने सुविधा तपाईंको भूमिकामा उपलब्ध छैन। चाहिए भने एडमिनसँग सम्पर्क गर्नुहोस्।</p>
      ) : (
        <>
      {wall && (
        <Opt icon="🖼" title="भित्ते वंशवृक्ष" info={<><b>{wall.root.name}</b> को पुस्ताको वंशावली ({np(wall.g.people.length)} जना), फोटो सहित, भित्तामा टाँस्न मिल्ने ठूलो चित्र। साना बालबालिकाको फोटो र मिति पनि समावेश हुन्छ। फोन, ठेगाना, टिप्पणी कहिल्यै आउँदैन। छापिएको नाम र मिति तल स्थायी रूपमा छापिन्छ। A2 (४२×५९.४ सेमी) वा A1 मा छाप्न SVG लिनुहोस्; फोन/कम्प्युटरमा हेर्न JPG।</>}>
          <button disabled={!!busy} onClick={() => prep("wall-jpg", async () => {
            const l = bestLayout(wall.g, 594, 420);
            const ph = await loadPhotos(l.cards.map((c) => c.p), can);
            const st = await mkStamp(`wall|${wall.root.id}|${l.cards.length}`);
            const svg = posterSvg(l, can, nm, ph, { title: [`${wall.root.name} को `, "वंशवृक्ष"], stamp: st });
            const sz = svgSize(svg);
            const blob = await jpgBlob(svg, sz.w - 40, sz.h - 40);
            return { blob, fileName: `vanshabriksha-${wall.root.name}-${stamp()}.jpg`, images: [{ src: URL.createObjectURL(blob) }], note: `${np(l.cards.length)} जना · हस्ताक्षर ID ${st.id}` };
          })}>{busy === "wall-jpg" ? "बन्दैछ…" : "JPG हेर्ने / डाउनलोड"}</button>
          <button className="ghost" disabled={!!busy} onClick={() => prep("wall-svg", async () => {
            const l = bestLayout(wall.g, 594, 420);
            const ph = await loadPhotos(l.cards.map((c) => c.p), can);
            const st = await mkStamp(`wallsvg|${wall.root.id}|${l.cards.length}`);
            const blob = svgBlob(posterSvg(l, can, nm, ph, { title: [`${wall.root.name} को `, "वंशवृक्ष"], stamp: st }));
            return { blob, fileName: `vanshabriksha-${wall.root.name}-${stamp()}.svg`, images: [{ src: URL.createObjectURL(blob) }], note: `${np(l.cards.length)} जना · हस्ताक्षर ID ${st.id}` };
          })}>{busy === "wall-svg" ? "बन्दैछ…" : "SVG (छाप्न)"}</button>
        </Opt>
      )}
      <Opt icon="📷" title="फोटो (JPG)" info={<>चार्ट ठूलो हुँदा फोटोको गुणस्तर स्पष्ट नहुने भएकाले यसमा तपाईंको स्थानभन्दा ७ पुस्ता माथि (सिधा पुर्खा) र ७ पुस्ता तल (सन्तान), पति/पत्नीसहित आउँछ। प्रोफाइल फोटो भएकाको फोटो नै देखिन्छ। फोन/कम्प्युटरको ग्यालरीमा हेर्न मिल्छ।</>}>
        <button disabled={!!busy} onClick={() => prep("jpg", async () => {
          const l = near();
          const ph = await loadPhotos(l.cards.map((c) => c.p), can);
          const st = await mkStamp(`jpg|${l.cards.length}`);
          const svg = posterSvg(l, can, nm, ph, { title: ["सात पुस्ता, ", "एउटै वंश"], stamp: st });
          const sz = svgSize(svg);
          const blob = await jpgBlob(svg, sz.w - 40, sz.h - 40);
          return { blob, fileName: `baral-banshabrikshya-${stamp()}.jpg`, images: [{ src: URL.createObjectURL(blob) }], note: `${np(l.cards.length)} जना · हस्ताक्षर ID ${st.id}` };
        })}>{busy === "jpg" ? "बन्दैछ…" : "फोटो हेर्ने / डाउनलोड"}</button>
      </Opt>

      <Opt icon="🖼" title="SVG चित्र" info={<>उच्च गुणस्तरको चित्र, जतिसुकै ठूलो गर्दा पनि स्पष्ट रहन्छ। प्रोफाइल फोटो भएकाको फोटो नै देखिन्छ (नभए नामको पहिलो अक्षर)। Chrome/Safari वा कुनै SVG viewer एपमा खोल्नुहोस्। तपाईंले हेर्न पाउने सबै व्यक्ति समावेश हुन्छन्।</>}>
        <button disabled={!!busy} onClick={() => prep("svg", async () => {
          const l = full();
          const ph = await loadPhotos(l.cards.map((c) => c.p), can);
          const st = await mkStamp(`svg|${l.cards.length}`);
          const blob = svgBlob(posterSvg(l, can, nm, ph, { title: ["पूरा वंशावली, ", "एउटै रगत"], stamp: st }));
          return { blob, fileName: `baral-banshabrikshya-${stamp()}.svg`, images: [{ src: URL.createObjectURL(blob) }], note: `${np(l.cards.length)} जना · हस्ताक्षर ID ${st.id}` };
        })}>{busy === "svg" ? "बन्दैछ…" : "SVG हेर्ने / डाउनलोड"}</button>
      </Opt>

      <Opt icon="📄" title="PDF" info={<>तपाईंले हेर्न पाउने सबै व्यक्ति पहिला ठाडो झरना ढाँचामा, त्यसपछि चार्ट। चार्ट ठूलो भए पढ्न मिल्ने साइजमै राखेर पूरा चार्टको नक्सा-पृष्ठ (रातो ग्रिड) र ग्रिडअनुसारका खण्ड (A1, A2…) छापिन्छ; हरेक खण्डमा "→ A2" जस्ता निरन्तरताका चिन्ह हुन्छन् — खण्ड जोडेर पूरा पोस्टर बनाउन सकिन्छ।</>}>
        <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="कागज साइज">
          <option value="a4">A4</option>
          <option value="a3">A3</option>
          <option value="a2">A2</option>
        </select>
        <button disabled={!!busy} onClick={() => prep("pdf", async () => {
          const st = await mkStamp(`pdf|${g.people.length}|${paper}`);
          const out = await allPrint(g, { can, nm }, paper, st, (ps) => loadPhotos(ps, can));
          return { blob: out.blob, fileName: `baral-banshabrikshya-${paper.toUpperCase()}.pdf`, images: out.pages.map((x) => ({ src: x.thumb, label: x.label })), note: `${np(out.cascadePages)} झरना पृष्ठ + ${np(out.chartPages)} चार्ट पृष्ठ · हस्ताक्षर ID ${st.id}` };
        })}>{busy === "pdf" ? "बन्दैछ…" : "PDF हेर्ने / डाउनलोड"}</button>
      </Opt>

      <Opt icon="📊" title="Excel (.xlsx)" info={<>स्तम्भ: नाम, हजुरबुबा, बुबा, आमा, जन्म मिति, जन्म स्थान, ठेगाना, शिक्षा, पेशा, वैवाहिक अवस्था, पति/पत्नी, सम्पर्क नम्बर, email, facebook link, टिप्पणी। {isStaff ? "तपाईं एडमिन/मोडरेटर हुनुहुन्छ — सबैको फोन/इमेल आउँछ।" : "फोन/इमेल तपाईंको आफ्नो पङ्क्तिमा मात्र आउँछ।"} (वैवाहिक अवस्था पति/पत्नीको विवरणबाट निकालिन्छ।)</>}>
        <button disabled={!!busy} onClick={() => prep("xlsx", async () => {
          const st = await mkStamp(`xlsx|${g.people.length}`);
          const x = await mainXlsxBlob(g, { can, isStaff, myPosId }, st);
          return { blob: x.blob, fileName: `baral-banshabrikshya-${stamp()}.xlsx`, table: { head: x.head, rows: x.rows.map((r) => r.map(String)) }, note: `${np(x.rows.length)} जना · हस्ताक्षर ID ${st.id}` };
        })}>{busy === "xlsx" ? "बन्दैछ…" : "Excel हेर्ने / डाउनलोड"}</button>
      </Opt>

        </>
      )}
      <Opt icon="🔁" title="आयात / निर्यात" info={isAdm ? "Excel टेम्प्लेट डाउनलोड, भरेर अपलोड (नयाँ व्यक्ति थप्न), तथा पूर्ण ब्याकअप।" : "Excel टेम्प्लेट डाउनलोड गरी नयाँ व्यक्ति भरेर अपलोड गर्ने — एडमिनको स्वीकृतिका लागि अनुरोध बन्छ।"}>
        <button className="ghost" onClick={() => openDialog(<ImportExportDialog />)}>विन्डो खोल्ने</button>
      </Opt>
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button className="ghost" onClick={closeDialog}>बन्द</button>
      </div>
    </div>
  );
}

/** Preview of a template upload: what will be added, what was rejected. */
function TemplatePreview({ parse, isAdm, onResolve }: { parse: TemplateParse; isAdm: boolean; onResolve: (ok: boolean) => void }) {
  const { drafts, errors, editedExisting } = parse;
  return (
    <div className="dlw">
      <h3>अपलोड अघि जाँच</h3>
      <p>
        <b>{np(drafts.length)}</b> नयाँ व्यक्ति तयार{errors.length ? <> · <b>{np(errors.length)}</b> पङ्क्तिमा समस्या</> : null}
        {editedExisting ? <> · <b>{np(editedExisting)}</b> अहिलेका व्यक्तिमा गरिएको सच्याइ लिइएन (अहिले नयाँ थप्न मात्र)</> : null}
      </p>
      <p className="mut">{isAdm ? "थप्ने थिच्दा सीधै वंशावलीमा थपिन्छ।" : "अनुरोध पठाउँदा एडमिनले स्वीकृत गरेपछि मात्र वंशावलीमा देखिन्छ।"}</p>
      {errors.length > 0 && (
        <details open>
          <summary><b>समस्या भएका पङ्क्ति ({np(errors.length)}) — यी छोडिनेछन्</b></summary>
          <div style={{ maxHeight: "30dvh", overflow: "auto" }}>
            {errors.map((e, i) => (
              <div key={i} className="mut" style={{ padding: ".2rem 0" }}>पङ्क्ति {e.row ? np(e.row) : "—"}: {e.msg}</div>
            ))}
          </div>
        </details>
      )}
      {drafts.length > 0 && (
        <details open={!errors.length}>
          <summary><b>थपिने ({np(drafts.length)})</b></summary>
          <div style={{ maxHeight: "30dvh", overflow: "auto" }}>
            {drafts.map((d: NewPersonDraft) => (
              <div key={d.row} style={{ padding: ".25rem 0" }}>
                <b>➕ {String(d.payload.name)}</b> <span className="mut">{d.brief}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="row" style={{ marginTop: ".8rem" }}>
        <button disabled={!drafts.length} onClick={() => onResolve(true)}>{isAdm ? "थप्ने" : "अनुरोध पठाउने"} ({np(drafts.length)})</button>
        <button className="ghost" onClick={() => onResolve(false)}>रद्द</button>
      </div>
    </div>
  );
}

/** Template download / upload for everyone; full backup and legacy file import for admin. */
export function ImportExportDialog() {
  const { db, g, me, perms, people, myPosId, openDialog, closeDialog, reload, submit, toast } = useVansh();
  const { can, isStaff, isAdm } = perms;
  const fileRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mayRequest = isStaff || perms.act === "premium";

  const mkStamp = useStampMaker();
  const getTemplate = async () => {
    setBusy(true);
    try {
      const st = await mkStamp(`template|${g.people.length}`);
      const blob = await buildTemplate(g, { can, isStaff, myPosId }, st.line);
      openDialog(<DownloadPreview data={{ blob, fileName: templateName(), note: <>{BRAND} Excel टेम्प्लेट — तपाईंले हेर्न पाउने {np(g.people.filter((x) => can(x.id)).length)} जना अघिल्लै भरिएका र नयाँ व्यक्तिका लागि खाली पङ्क्ति। हस्ताक्षर ID {st.id}</> }} onCancel={() => openDialog(<ImportExportDialog />)} />);
    } catch (e) {
      alert((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadTemplate = async (f: File) => {
    if (!me) return;
    setBusy(true);
    try {
      const parse = await parseTemplate(f, g, { can, isStaff, myPosId });
      // same permission rule as the person form (premium: parent must be inside own area)
      const ok: NewPersonDraft[] = [];
      for (const d of parse.drafts) {
        const bad = guardRequest(perms, "add", null, d.payload);
        if (bad) parse.errors.push({ row: d.row, msg: `${String(d.payload.name)}: ${bad}` });
        else ok.push(d);
      }
      parse.drafts = ok;
      parse.errors.sort((a, b) => a.row - b.row);
      const go = await new Promise<boolean>((res) => openDialog(<TemplatePreview parse={parse} isAdm={isAdm} onResolve={res} />));
      if (!go) return closeDialog();
      const batch = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      const reqs = parse.drafts.map((d) => makeRequest(me, "add", null, { ...d.payload, batch }, "Excel टेम्प्लेटबाट"));
      const err = await submit(reqs, `✅ ${np(reqs.length)} अनुरोध पठाइयो — एडमिनको स्वीकृतिपछि देखिनेछ`);
      if (err) alert(err);
      closeDialog();
    } catch (e) {
      alert("अपलोड भएन: " + ((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

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
  void toast;
  return (
    <div className="dlw">
      <h3>🔁 आयात / निर्यात</h3>
      <div className="dlopt">
        <div className="dlo-h"><b>१. टेम्प्लेट डाउनलोड</b></div>
        <p className="mut">तपाईंले हेर्न पाउने व्यक्तिहरू पहिले नै भरिएको (हेर्न मात्र) Excel फाइल, तल नयाँ व्यक्ति थप्न खाली पङ्क्ति। बुबा/आमा सूचीबाट छान्न मिल्छ, मिति र फोनको ढाँचा मिलाइएको छ। निर्देश शीटमा पढ्नुहोस्।</p>
        <div className="row"><button disabled={busy} onClick={getTemplate}>{busy ? "…" : "टेम्प्लेट डाउनलोड"}</button></div>
      </div>
      <div className="dlopt">
        <div className="dlo-h"><b>२. भरेको फाइल अपलोड</b></div>
        <p className="mut">
          अहिले नयाँ व्यक्ति थप्न मात्र (अहिलेका व्यक्ति सच्याउने सुविधा पछि आउँछ)। {isAdm ? "एडमिनको अपलोड जाँचपछि सीधै थपिन्छ।" : mayRequest ? "तपाईंको अपलोड एडमिनको स्वीकृतिका लागि अनुरोध बन्छ। " + (perms.act === "premium" ? "बुबा/आमा तपाईंकै सम्पादन क्षेत्रभित्रका हुनुपर्छ।" : "") : "तपाईंको भूमिकाले अपलोड अनुरोध पठाउन मिल्दैन।"}
          {" "}कडा जाँच अपलोडमा नै हुन्छ — Excel को सुरक्षामा भर नपर्नुहोस्।
        </p>
        <div className="row">
          <button disabled={busy || !mayRequest} onClick={() => tplRef.current?.click()}>📥 Excel अपलोड</button>
          <input type="file" ref={tplRef} accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadTemplate(f); e.target.value = ""; }} />
        </div>
      </div>
      {isAdm && (
        <div className="dlopt">
          <div className="dlo-h"><b>३. एडमिन: पूर्ण ब्याकअप / पुरानो ढाँचाको आयात</b></div>
          <p className="mut">आयात गर्नुअघि JSON ब्याकअप लिनुहोस्। फाइलमा नभएका व्यक्ति हटाइँदैनन्; पूर्वावलोकनमा फरक देखिन्छ।</p>
          <div className="row">
            <button className="ghost" onClick={() => exportXLSX(g).catch((e) => alert(e.message))}>📊 पूर्ण Excel</button>
            <button className="ghost" onClick={() => exportCSV(g)}>📄 CSV</button>
            <button className="ghost" onClick={() => exportJSON(people)}>💾 JSON</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>📥 पुरानो फाइल अपलोड</button>
            <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
          </div>
        </div>
      )}
      <div className="row"><button className="ghost" onClick={closeDialog}>बन्द</button></div>
    </div>
  );
}

export default function DownloadMenu() {
  const { perms, openDialog } = useVansh();
  const open = () => openDialog(<DownloadDialog />);
  return (
    <details className="menu">
      <summary onClick={(e) => { e.preventDefault(); open(); }}>{perms.isAdm ? "⇩ डाउनलोड" : "⇩ बंशावली डाउनलोड"}</summary>
    </details>
  );
}
