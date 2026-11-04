"use client";
// Locked cards: ask the admin for permission to see a person; admin approves or rejects; admin can also preview the site as a person.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useVansh } from "./VanshContext";
import { Sx, personOptions, useSx } from "./ui";

export function ViewRequestDialog({ personId }: { personId: string }) {
  const { db, closeDialog, toast } = useVansh();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const { error } = await db.rpc("request_view", { p_person: personId, p_reason: reason });
    setBusy(false);
    if (error) return alert(error.message);
    toast("✅ अनुरोध एडमिनलाई पठाइयो — स्वीकृत भएपछि यो व्यक्ति देखिनेछ");
    closeDialog();
  };
  return (
    <div className="dlw">
      <h3>🔒 यो जानकारी तपाईंको पहुँचमा छैन</h3>
      <p className="mut">एडमिनले स्वीकृत गरेमा यो व्यक्तिको जानकारी तपाईंले हेर्न पाउनुहुन्छ। किन चाहिएको हो भन्ने छोटो कारण लेख्दा एडमिनलाई निर्णय गर्न सजिलो हुन्छ।</p>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="जस्तै: यो मेरो मामा हुनुहुन्छ, उहाँको विवरण थप्न चाहन्छु" maxLength={300} style={{ width: "100%" }} />
      <div className="row" style={{ marginTop: ".6rem" }}>
        <button disabled={busy} onClick={send}>{busy ? "पठाउँदै…" : "अनुरोध पठाउने"}</button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </div>
  );
}

interface VReq {
  id: string; status: string; reason: string | null; created_at: string;
  user_id: string; user_name: string; person_id: string; person_name: string;
}

/** Admin section: view-permission requests (pending first, then granted ones that can be revoked). */
export function ViewRequestsPanel({ onCount }: { onCount?: (n: number) => void }) {
  const { db, toast } = useVansh();
  const [rows, setRows] = useState<VReq[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await db.rpc("admin_view_requests");
    if (error) return alert(error.message);
    const list = (data as VReq[]) || [];
    setRows(list);
    onCount?.(list.filter((r) => r.status === "pending").length);
  }, [db, onCount]);
  useEffect(() => {
    load();
  }, [load]);
  const review = async (id: string, ok: boolean) => {
    const { error } = await db.rpc("review_view_request", { p_id: id, p_approve: ok });
    if (error) return alert(error.message);
    toast(ok ? "✅ अनुमति दिइयो" : "अनुरोध अस्वीकार गरियो");
    load();
  };
  const revoke = async (r: VReq) => {
    if (!confirm(`${r.user_name} ले ${r.person_name} हेर्ने अनुमति फिर्ता लिने?`)) return;
    const { error } = await db.rpc("admin_revoke_view", { p_user: r.user_id, p_person: r.person_id });
    if (error) return alert(error.message);
    toast("अनुमति फिर्ता लिइयो");
    load();
  };
  if (!rows) return null;
  const pend = rows.filter((r) => r.status === "pending");
  const ok = rows.filter((r) => r.status === "approved");
  return (
    <>
      {!pend.length && <div className="card">पर्खाइमा कुनै अनुरोध छैन।</div>}
      {pend.map((r) => (
        <div className="card" key={r.id}>
          <b>{r.user_name}</b> ले <b>{r.person_name}</b> को जानकारी हेर्न माग्नुभएको छ
          {r.reason && <p className="mut">कारण: {r.reason}</p>}
          <div className="row">
            <button onClick={() => review(r.id, true)}>अनुमति दिने</button>
            <button className="bad" onClick={() => review(r.id, false)}>अस्वीकार</button>
          </div>
        </div>
      ))}
      {ok.length > 0 && (
        <details>
          <summary><b>दिइएका अनुमति ({ok.length})</b></summary>
          {ok.map((r) => (
            <div className="card" key={r.id}>
              {r.user_name} → {r.person_name}
              <div className="row"><button className="ghost" onClick={() => revoke(r)}>फिर्ता लिने</button></div>
            </div>
          ))}
        </details>
      )}
    </>
  );
}

/** Admin section: see the site as a given person (read-only preview of what the rules send them). */
export function PreviewAsPanel() {
  const { g, perms, previewAs, setPreviewAs, act, toast } = useVansh();
  const sx = useSx({ value: previewAs, label: previewAs ? g.byId[previewAs]?.name || "" : "" });
  const opts = useMemo(() => personOptions(g, perms), [g, perms]);
  return (
    <div className="card">
      <p>कुनै सदस्यको स्थान छानेर, माथिको भूमिका बदल्ने बटनबाट भूमिका (सामान्य / बंशज / मोडरेटर) छान्नुहोस्। सर्भरले त्यो व्यक्तिलाई के पठाउँछ, त्यही देखिन्छ। केवल हेर्न मात्र हुन्छ — कुनै डेटा बदलिँदैन।</p>
      <p className="mut">अहिलेको भूमिका: <b>{act}</b>{previewAs ? <> · पूर्वावलोकन: <b>{g.byId[previewAs]?.name}</b></> : null}</p>
      <Sx st={sx} options={opts} />
      <div className="row">
        <button onClick={() => (sx.value ? (setPreviewAs(sx.value), toast("पूर्वावलोकन सुरु भयो")) : alert("पहिले व्यक्ति छान्नुहोस्।"))}>यो व्यक्तिको रूपमा हेर्ने</button>
        {previewAs && <button className="ghost" onClick={() => setPreviewAs(null)}>पूर्वावलोकन बन्द</button>}
      </div>
    </div>
  );
}
