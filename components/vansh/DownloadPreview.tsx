"use client";
// Every download goes through this window first: look at the result, then save it or cancel.
import React, { useEffect, useMemo, useState } from "react";
import { useVansh } from "./VanshContext";
import { makeStamp, type Stamp } from "@/lib/vansh/notice";

export interface Prepared {
  blob: Blob;
  fileName: string;
  /** page / image previews (data URLs) */
  images?: { src: string; label?: string }[];
  /** table preview (Excel) */
  table?: { head: string[]; rows: string[][] };
  note?: React.ReactNode;
}

/** Name used in the signature: the person's own position name, else their account name. */
export function useStampMaker() {
  const { me, people } = useVansh();
  return (seed: string): Promise<Stamp> => {
    const who = (me?.position_person_id && people.find((p) => p.id === me.position_person_id)?.name) || me?.full_name || me?.email || "";
    return makeStamp(who, me?.id || "", seed);
  };
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function DownloadPreview({ data, onCancel }: { data: Prepared; onCancel: () => void }) {
  const { toast, closeDialog } = useVansh();
  const [i, setI] = useState(0);
  const isImg = !!data.images?.length;
  const kb = useMemo(() => Math.max(1, Math.round(data.blob.size / 1024)), [data.blob]);
  useEffect(() => setI(0), [data]);
  const cur = data.images?.[i];
  return (
    <div className="dlw dlp">
      <h3>👁 डाउनलोड अघि हेर्नुहोस्</h3>
      <p className="mut">{data.fileName} · {kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB"}</p>
      {data.note && <p className="mut">{data.note}</p>}
      {isImg && cur && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="dlp-img" src={cur.src} alt={cur.label || "पृष्ठ"} />
          {data.images!.length > 1 && (
            <div className="row dlp-nav">
              <button className="ghost" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="अघिल्लो">‹</button>
              <span>{cur.label || `पृष्ठ ${i + 1}`} · {i + 1} / {data.images!.length}</span>
              <button className="ghost" disabled={i === data.images!.length - 1} onClick={() => setI(i + 1)} aria-label="अर्को">›</button>
            </div>
          )}
        </>
      )}
      {data.table && (
        <div className="dlp-tbl">
          <table>
            <thead><tr>{data.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{data.table.rows.slice(0, 12).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
          </table>
          {data.table.rows.length > 12 && <p className="mut">… अरू {data.table.rows.length - 12} पङ्क्ति फाइलमा हुन्छन्।</p>}
        </div>
      )}
      <div className="row" style={{ marginTop: ".8rem" }}>
        <button onClick={() => { saveBlob(data.blob, data.fileName); toast("डाउनलोड भयो"); closeDialog(); }}>⬇ डाउनलोड गर्ने</button>
        <button className="ghost" onClick={onCancel}>रद्द</button>
      </div>
    </div>
  );
}
