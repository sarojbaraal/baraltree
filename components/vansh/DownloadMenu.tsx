"use client";
// Download / import menu (moved here from the chart toolbar; shown in the Family section).
import React, { useEffect, useRef, useState } from "react";
import { computeLayout } from "@/lib/vansh/layout";
import { exportCSV, exportJPG, exportJSON, exportSVG, exportXLSX, svgText } from "@/lib/vansh/exporters";
import { diffImport, parseImportRows, readImportFile } from "@/lib/vansh/importer";
import { useVansh } from "./VanshContext";
import { ImportPreview } from "./AdminDialogs";

export default function DownloadMenu() {
  const { db, g, people, perms, openDialog, closeDialog, reload } = useVansh();
  const { can, nm, isAdm } = perms;
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.("#dlg, .popover, .suggestions")) return;
      if (!t.closest?.("details.menu")) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  // the whole chart, every branch unfolded
  const full = () => computeLayout(g, new Set());
  const svg = () => svgText(full(), can, nm);

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
    <details className="menu" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{isAdm ? "⇩ डाउनलोड" : "⇩ बंशावली डाउनलोड"}</summary>
      <div onClick={() => setOpen(false)}>
        {isAdm && (
          <>
            <button className="ghost" onClick={() => exportXLSX(g).catch((e) => alert(e.message))}>📊 Excel (.xlsx)</button>
            <button className="ghost" onClick={() => exportCSV(g)}>📄 CSV</button>
            <button className="ghost" onClick={() => exportJSON(people)}>💾 JSON (ब्याकअप)</button>
          </>
        )}
        <button className="ghost" onClick={() => exportSVG(svg())}>🖼 फोटो (HD) (SVG)</button>
        <button
          className="ghost"
          onClick={() => {
            const l = full();
            exportJPG(svgText(l, can, nm), l.W, l.H).catch((e) => alert(e.message));
          }}
        >
          📷 फोटो (SD) (JPG)
        </button>
        {isAdm && (
          <>
            <button className="ghost" onClick={() => fileRef.current?.click()}>📥 अपलोड गर्नुहोस्</button>
            <input
              type="file"
              ref={fileRef}
              accept=".xlsx,.xls,.csv,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </details>
  );
}
