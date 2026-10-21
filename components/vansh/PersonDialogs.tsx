"use client";
// Dialogs for adding / editing / deleting people and relations (ported from the original app.js: form, kidsForm,
// spouseForm, parentForm, addMenu, inviteForm).
import React, { useEffect, useRef, useState } from "react";
import type { VPerson, NewRequest } from "@/lib/vansh/types";
import { ORDER, ROLE_L } from "@/lib/vansh/graph";
import {
  GOT, buildKidRequests, buildPersonPayload, makeRequest, type KidDraft,
} from "@/lib/vansh/requests";
import { fbOk, surnameOf, wifeNames, yr } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";
import { Avatar, DateField, PasswordField, Sx, SXMSG, personOptions, useSx } from "./ui";

const siteUrl = () => `${location.origin}${location.pathname}`;

function Note({ label = "एडमिनलाई सन्देश", value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const { perms } = useVansh();
  if (perms.isAdm) return null;
  return (
    <label>
      {label}
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ---------------- delete ----------------
export function DeleteDialog({ p }: { p: VPerson }) {
  const { perms, send, closeDialog } = useVansh();
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <>
      <h3>
        &quot;{p.name}&quot; {perms.isAdm ? "हटाउने" : "हटाउन अनुरोध"}
      </h3>
      {perms.isAdm ? (
        <p className="mut">यो व्यक्ति स्थायी रूपमा हटाइनेछ। पक्का हुनुहुन्छ?</p>
      ) : (
        <label>
          कारण
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <div className="msg" id="fm">{err}</div>
      <div className="row">
        <button
          className="bad"
          onClick={async () => {
            const e = await send("delete", p.id, {}, note);
            if (e) setErr(e);
            else closeDialog();
          }}
        >
          {perms.isAdm ? "हो, हटाउने" : "अनुरोध पठाउने"}
        </button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- add / edit person ----------------
interface PersonFormProps {
  action: "add" | "update";
  p?: VPerson | null;
  parent?: VPerson | null;
  pre?: Partial<VPerson> | null;
}

export function PersonForm({ action, p = null, parent = null, pre = null }: PersonFormProps) {
  const { db, g, perms, me, send, closeDialog, toast, reload } = useVansh();
  const [v] = useState<Partial<VPerson>>(() => {
    const v: Partial<VPerson> = p ? { ...p } : { is_living: true };
    if (pre) Object.assign(v, pre);
    if (parent) {
      const sp = parent.spouse_id;
      if (parent.gender === "F") {
        v.mother_id = parent.id;
        v.father_id = sp || "";
      } else {
        v.father_id = parent.id;
        v.mother_id = sp || "";
      }
    }
    return v;
  });
  const { byId } = g;

  const [gender, setGender] = useState(v.gender || "");
  const [married, setMarried] = useState(!!(v.spouse_id || v.married_name || v.maiden_name || v.more_spouse_ids?.length));
  const [name, setName] = useState(v.name || "");
  const [maiden, setMaiden] = useState(v.maiden_name || "");
  const [marriedName, setMarriedName] = useState(v.married_name || "");
  const [living, setLiving] = useState(v.is_living !== false);
  const [birth, setBirth] = useState(v.birth_bs || "");
  const [death, setDeath] = useState(v.death_bs || "");
  const [birthPlace, setBirthPlace] = useState(v.birth_place || "");
  const [phone, setPhone] = useState(v.phone || "");
  const [fb, setFb] = useState(v.facebook || "");
  const [address, setAddress] = useState(v.address || "");
  const [notes, setNotes] = useState(v.notes || "");
  const [nt, setNt] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const lm = useRef((v.married_name || "").trim());

  const lab = (id?: string | null) => (id ? byId[id]?.name || "" : "");
  const father = useSx({ value: v.father_id, label: lab(v.father_id) });
  const mother = useSx({ value: v.mother_id, label: lab(v.mother_id) });
  const spouse = useSx({ value: v.spouse_id, label: lab(v.spouse_id) });
  const opts = personOptions(g, perms);
  const spn = v.spouse_id && byId[v.spouse_id] ? byId[v.spouse_id].name : "";

  /** A wife takes her husband's surname: keeps name / maiden / married names consistent. */
  const marriedNames = (): { name: string; maiden: string; married: string } | null => {
    if (gender !== "F" || !married) return null;
    if (spouse.value && byId[spouse.value]?.gender === "F") return null;
    const hs = surnameOf(spouse.value ? byId[spouse.value]?.name : spouse.newName);
    if (!hs) return null;
    const r = wifeNames(name, maiden.trim(), marriedName.trim(), hs);
    return r ? { name: r.name, maiden: r.maiden_name, married: r.married_name } : null;
  };
  useEffect(() => {
    const r = marriedNames();
    if (!r) return;
    if (r.maiden !== maiden) setMaiden(r.maiden);
    if (r.married !== marriedName) setMarriedName(r.married);
    lm.current = r.married;
    if (r.name !== name) setName(r.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, married, spouse.value, spouse.newName]);

  const onMarriedName = (nv0: string) => {
    const nv = nv0.trim();
    let n = name.trim();
    if (lm.current && n.endsWith(" " + lm.current)) n = n.slice(0, -(lm.current.length + 1));
    setName(nv ? (n ? n + " " + nv : nv) : n);
    lm.current = nv;
    setMarriedName(nv0);
  };

  const pickContact = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.contacts?.select) return toast("सम्पर्क छान्न Android Chrome (HTTPS) चाहिन्छ");
    try {
      const [c] = await nav.contacts.select(["name", "tel"], { multiple: false });
      if (c?.tel?.[0]) setPhone(String(c.tel[0]).replace(/[^\d+]/g, ""));
      if (c?.name?.[0] && !name) setName(c.name[0]);
    } catch {}
  };

  const title =
    action === "add"
      ? perms.isAdm ? "नयाँ व्यक्ति थप्ने" : "नयाँ व्यक्ति थप्ने अनुरोध"
      : `${p?.name} को प्रोफाइल ${perms.isAdm ? "सच्याउने" : "सच्याउने अनुरोध"}`;

  const submit = async () => {
    if (busy) return;
    if (father.pending || mother.pending || spouse.pending) return setErr(SXMSG);
    setBusy(true);
    setErr("");
    try {
      // use the surname-adjusted names exactly as the original did at submit time
      const mn = marriedNames();
      const finalName = mn?.name ?? name;
      const finalMaiden = mn?.maiden ?? maiden;
      const finalMarried = mn?.married ?? marriedName;

      let photoUrl: string | undefined;
      if (photo) {
        setErr("📸 फोटो अपलोड हुँदैछ...");
        const ext = photo.name.split(".").pop();
        const fileName = `${p?.id || "new"}-${Date.now()}.${ext}`;
        const { error: upErr } = await db.storage.from("profile-photos").upload(fileName, photo, { contentType: photo.type || undefined });
        if (upErr) return setErr("❌ फोटो अपलोड असफल: " + upErr.message);
        photoUrl = db.storage.from("profile-photos").getPublicUrl(fileName).data.publicUrl;
        setErr("");
      }

      const res = buildPersonPayload(
        {
          action,
          person: p,
          married,
          facebook: action === "update" ? fb : undefined,
          photoUrl,
          values: {
            name: finalName, gender, father_id: father.value, mother_id: mother.value, spouse_id: spouse.value,
            father_name: father.newName, mother_name: mother.newName, spouse_name: spouse.newName,
            is_living: living, birth_bs: birth, death_bs: death, phone, address, notes,
            maiden_name: finalMaiden, married_name: finalMarried, birth_place: birthPlace,
          },
        },
        fbOk
      );
      if (res.error || !res.payload) return setErr(res.error || "");
      const payload = res.payload;
      if (res.facebookChanged && p) {
        if (perms.isAdm) {
          const { error } = await db.rpc("set_facebook", { pid: p.id, url: res.facebook });
          if (error) return setErr(error.message);
          if (!Object.keys(payload).length) {
            closeDialog();
            toast("✅ सुरक्षित भयो");
            await reload();
            return;
          }
        } else payload.facebook = res.facebook;
      }
      const e = await send(action, p?.id ?? null, payload, nt);
      if (e) setErr(e);
      else closeDialog();
    } finally {
      setBusy(false);
    }
  };

  const radio = (nmx: string, val: string, label: string, cur: string, set: (v: string) => void) => (
    <label>
      <input type="radio" name={nmx} value={val} checked={cur === val} onChange={() => set(val)} />
      {label}
    </label>
  );

  return (
    <div className="edw">
      <aside className="eds">
        <div className={`pp-av g${gender || "O"}`} id="eds-a">
          <Avatar g={gender} />
        </div>
        <b id="eds-n">{name || "नयाँ व्यक्ति"}</b>
        <span id="eds-y">{yr(birth)}</span>
      </aside>
      <div className="edm">
        <button type="button" className="ghost pp-x" aria-label="बन्द" onClick={closeDialog}>×</button>
        <div className="edb">
          <h2>{title}</h2>
          <div className="rad">
            {radio("gx", "M", "पुरुष", gender, setGender)}
            {radio("gx", "F", "महिला", gender, setGender)}
            {radio("gx", "O", "अन्य / अज्ञात", gender, setGender)}
          </div>
          <label className="rcb" style={{ marginTop: ".9rem" }}>
            <input type="checkbox" checked={married} onChange={(e) => setMarried(e.target.checked)} /> विवाहित हो
          </label>
          <label>
            नाम
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            प्रोफाइल फोटो
            <input type="file" accept="image/*" style={{ marginTop: "0.5rem" }} onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            {v.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.photo_url} alt="" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", marginTop: "0.5rem", border: "2px solid var(--line)", display: "block" }} />
            )}
          </label>
          <div className="edg mnl" hidden={!(gender === "F" && married)}>
            <label>
              विवाहपछिको थर (पतिको थरबाट स्वतः, नामको अन्त्यमा जोडिन्छ)
              <input value={marriedName} onChange={(e) => onMarriedName(e.target.value)} />
            </label>
          </div>
          <hr />
          <div className="edg">
            <div>
              <label>जन्म मिति (BS) — YYYY-MM-DD</label>
              <DateField value={birth} onChange={setBirth} />
            </div>
            <label>
              जन्म स्थान
              <input value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} />
            </label>
          </div>
          <hr />
          <div className="rad">
            {radio("lv", "true", "जीवित", String(living), (x) => setLiving(x === "true"))}
            {radio("lv", "false", "दिवंगत", String(living), (x) => setLiving(x === "true"))}
          </div>
          <div hidden={living}>
            <label>मृत्यु मिति (BS)</label>
            <DateField value={death} onChange={setDeath} />
          </div>
          <hr />
          <div className="sech">परिवार</div>
          <div className="edg">
            <label>
              बुबा
              <Sx st={father} options={opts} allowNew />
            </label>
            <label>
              आमा
              <Sx st={mother} options={opts} allowNew />
            </label>
          </div>
          <div hidden={!married}>
            <hr />
            <div className="sech">पति/पत्नी{spn ? ": " + spn : ""}</div>
            <label>
              पति/पत्नी
              <Sx st={spouse} options={opts} allowNew />
            </label>
          </div>
          <hr />
          <div className="sech">सम्पर्क</div>
          <div className="edg">
            <label>
              हालको फोन नम्बर
              <span style={{ display: "flex", gap: ".4rem" }}>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                <button type="button" className="ghost" aria-label="सम्पर्कबाट छान्ने" onClick={pickContact}>📇</button>
              </span>
            </label>
            {action === "update" && (
              <label>
                Facebook लिंक
                <input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="https://facebook.com/..." />
              </label>
            )}
          </div>
          <label>
            हालको ठेगाना
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <hr />
          <label>
            टिप्पणी
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <Note label="एडमिनलाई सन्देश (स्रोत/प्रमाण)" value={nt} onChange={setNt} />
          <div className="msg" id="fm">{err}</div>
        </div>
        <div className="edf">
          <button onClick={submit} disabled={busy}>{GOT(perms.isAdm)}</button>
          <button className="ghost" onClick={closeDialog}>रद्द</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- several children at once ----------------
interface KidRow extends KidDraft {
  key: number;
}
let kidKey = 0;
const newKid = (): KidRow => ({ key: ++kidKey, name: "", gender: "M", is_living: true, birth_bs: "", birth_place: "", married: false, spouse: "" });

export function KidsDialog({ parent }: { parent: VPerson }) {
  const { g, perms, me, submit, closeDialog } = useVansh();
  const sp = g.spousesOf(parent);
  const [other, setOther] = useState(sp.length === 1 ? sp[0] : "");
  const [kids, setKids] = useState<KidRow[]>([newKid()]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const upd = (key: number, patch: Partial<KidRow>) => setKids((ks) => ks.map((k) => (k.key === key ? { ...k, ...patch } : k)));
  const otherList = sp.length ? sp.map((i) => g.byId[i]) : g.people.filter((p) => perms.can(p.id));
  return (
    <>
      <h3>&quot;{parent.name}&quot; का सन्तान थप्ने</h3>
      <label>
        अर्को अभिभावक ({parent.gender === "F" ? "बुबा" : "आमा"}) — सूचीमा नभए पहिले उनको विवरण थप्नुहोस्
        <select value={other} onChange={(e) => setOther(e.target.value)}>
          <option value="">— छैन —</option>
          {otherList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <div id="krows">
        {kids.map((k) => (
          <div className="kcard" key={k.key}>
            <div className="edg">
              <label>
                नाम *
                <input value={k.name} onChange={(e) => upd(k.key, { name: e.target.value })} />
              </label>
              <label>
                लिङ्ग
                <select value={k.gender} onChange={(e) => upd(k.key, { gender: e.target.value })}>
                  <option value="M">छोरा</option>
                  <option value="F">छोरी</option>
                  <option value="">—</option>
                </select>
              </label>
            </div>
            <div className="edg">
              <div>
                <label>जन्म मिति (BS)</label>
                <DateField value={k.birth_bs} onChange={(x) => upd(k.key, { birth_bs: x })} />
              </div>
              <label>
                जन्म स्थान
                <input value={k.birth_place} onChange={(e) => upd(k.key, { birth_place: e.target.value })} />
              </label>
            </div>
            <div className="edg">
              <label>
                अवस्था
                <select value={String(k.is_living)} onChange={(e) => upd(k.key, { is_living: e.target.value === "true" })}>
                  <option value="true">जीवित</option>
                  <option value="false">दिवंगत</option>
                </select>
              </label>
              <label className="rcb" style={{ marginTop: "1.8rem" }}>
                <input type="checkbox" checked={k.married} onChange={(e) => upd(k.key, { married: e.target.checked })} /> विवाहित
              </label>
            </div>
            <div className="k-sp" hidden={!k.married}>
              <label>
                <span>{k.gender === "M" ? "पत्नीको नाम" : k.gender === "F" ? "पतिको नाम" : "पति/पत्नीको नाम"}</span>
                <input value={k.spouse} onChange={(e) => upd(k.key, { spouse: e.target.value })} />
              </label>
            </div>
            <button type="button" className="bad k-x" onClick={() => kids.length > 1 && setKids(kids.filter((x) => x.key !== k.key))}>
              × हटाउने
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="ghost" onClick={() => setKids([...kids, newKid()])}>+ अर्को सन्तान</button>
      </div>
      <Note value={note} onChange={setNote} />
      <div className="msg" id="fm">{err}</div>
      <div className="row">
        <button
          onClick={async () => {
            if (!me) return;
            if (!perms.canEdit(parent.id)) return setErr("यो व्यक्ति तपाईंको सम्पादन क्षेत्रमा हुनुहुन्न।");
            const r = buildKidRequests(me, parent, other, kids, note, sp.length);
            if (r.error || !r.requests) return setErr(r.error || "");
            const e = await submit(r.requests, `✅ ${r.requests.length} सन्तानको अनुरोध पठाइयो`);
            if (e) setErr(e);
            else closeDialog();
          }}
        >
          {GOT(perms.isAdm)}
        </button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- another spouse ----------------
export function SpouseDialog({ p }: { p: VPerson }) {
  const { g, perms, me, send, submit, closeDialog } = useVansh();
  const { byId } = g;
  const sx = useSx({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const opts = personOptions(g, perms);

  const go = async () => {
    if (!me) return;
    if (sx.pending) return setErr(SXMSG);
    const pl: Record<string, unknown> = {};
    const extra: NewRequest[] = [];
    const sw = sx.value ? byId[sx.value] : null;
    if (sx.value) {
      if (sx.value === p.id) return setErr("आफैंलाई छान्न मिल्दैन।");
      pl.add_spouse_id = sx.value;
    } else if (sx.newName.trim()) pl.add_spouse_name = sx.newName.trim();
    else return setErr("सूचीबाट छान्नुहोस् वा नाम लेख्नुहोस्।");

    const diff = (r: { name: string; maiden_name: string; married_name: string } | null, o: VPerson) =>
      Object.fromEntries(
        (["name", "maiden_name", "married_name"] as const)
          .filter((k) => r && String(r[k] || "") !== String(o[k] || ""))
          .map((k) => [k, r![k]])
      );
    if (p.gender === "F") {
      Object.assign(pl, diff(wifeNames(p.name, p.maiden_name, p.married_name, surnameOf(sw ? sw.name : sx.newName)), p));
    } else if (p.gender === "M") {
      if (!sw) {
        const r = wifeNames(sx.newName.trim(), "", "", surnameOf(p.name));
        if (r) pl.add_spouse_name = r.name;
      } else if (sw.gender === "F" && perms.canEdit(sw.id)) {
        const ch = diff(wifeNames(sw.name, sw.maiden_name, sw.married_name, surnameOf(p.name)), sw);
        if (Object.keys(ch).length) extra.push(makeRequest(me, "update", sw.id, ch, note));
      }
    }
    let e: string | null;
    if (!extra.length) e = await send("update", p.id, pl, note);
    else {
      if (!perms.isStaff && (perms.act !== "premium" || !perms.canEdit(p.id) || (pl.add_spouse_id && !perms.canEdit(String(pl.add_spouse_id)))))
        return setErr("यो व्यक्ति तपाईंको सम्पादन क्षेत्रमा हुनुहुन्न।");
      e = await submit([makeRequest(me, "update", p.id, pl, note), ...extra], "✅ अनुरोध पठाइयो — एडमिनको स्वीकृतिपछि देखिनेछ");
    }
    if (e) setErr(e);
    else closeDialog();
  };

  return (
    <>
      <h3>&quot;{p.name}&quot; को अर्को पति/पत्नी</h3>
      <label>
        सूचीबाट छान्नुहोस् वा नयाँ नाम लेख्नुहोस्
        <Sx st={sx} options={opts} allowNew />
      </label>
      <p className="mut">सन्तान थप्दा &quot;अर्को अभिभावक&quot; मा सम्बन्धित पत्नी/पति छान्नुहोस्, सन्तान आ-आफ्नी आमाको मुनि देखिन्छन्।</p>
      <Note value={note} onChange={setNote} />
      <div className="msg" id="fm">{err}</div>
      <div className="row">
        <button onClick={go}>{GOT(perms.isAdm)}</button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- father / mother ----------------
export function ParentDialog({ p, k }: { p: VPerson; k: "father" | "mother" }) {
  const { g, perms, send, closeDialog } = useVansh();
  const L = k === "father" ? "बुबा" : "आमा";
  const sx = useSx({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  return (
    <>
      <h3>
        &quot;{p.name}&quot; का {L} थप्ने
      </h3>
      <label>
        {L}
        <Sx st={sx} options={personOptions(g, perms)} allowNew />
      </label>
      <p className="mut">सूचीबाट छान्नुहोस् वा नयाँ नाम लेख्नुहोस्। बाँकी विवरण पछि Edit बाट भर्न सकिन्छ।</p>
      <Note value={note} onChange={setNote} />
      <div className="msg" id="fm">{err}</div>
      <div className="row">
        <button
          onClick={async () => {
            if (sx.pending) return setErr(SXMSG);
            const pl: Record<string, unknown> = {};
            if (sx.value) pl[k + "_id"] = sx.value;
            else if (sx.newName.trim()) pl[k + "_name"] = sx.newName.trim();
            else return setErr("सूचीबाट छान्नुहोस् वा नाम लेख्नुहोस्।");
            const e = await send("update", p.id, pl, note);
            if (e) setErr(e);
            else closeDialog();
          }}
        >
          {GOT(perms.isAdm)}
        </button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- "who to add" menu ----------------
export function AddMenu({ p }: { p: VPerson }) {
  const { openDialog, closeDialog, toast } = useVansh();
  const hp = !!p.father_id;
  const hm = !!p.mother_id;
  const go = (r: string) => {
    if (r === "kids") openDialog(<KidsDialog parent={p} />);
    else if (r === "spouse") openDialog(<SpouseDialog p={p} />);
    else if (r === "sib") {
      if (!hp && !hm) return toast("पहिले यो व्यक्तिको बुबा वा आमा थप्नुहोस्");
      openDialog(<PersonForm action="add" pre={{ father_id: p.father_id || "", mother_id: p.mother_id || "" }} />, true);
    } else openDialog(<ParentDialog p={p} k={r as "father" | "mother"} />);
  };
  return (
    <>
      <h3>&quot;{p.name}&quot; सँग को थप्ने?</h3>
      <p className="mut">कुन नाता थप्ने छान्नुहोस्।</p>
      <div className="relg">
        <button disabled={hp} onClick={() => go("father")}> बुबा{hp ? " (पहिले नै हुनुहुन्छ)" : ""}</button>
        <button disabled={hm} onClick={() => go("mother")}> आमा{hm ? " (पहिले नै हुनुहुन्छ)" : ""}</button>
        <button onClick={() => go("spouse")}> पति/पत्नी</button>
        <button onClick={() => go("kids")}> छोरा/छोरी</button>
        <button onClick={() => go("sib")}> दाजुभाइ/दिदीबहिनी</button>
      </div>
      <div className="row">
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- invitation link ----------------
export function InviteDialog({ p }: { p: VPerson }) {
  const { db, closeDialog } = useVansh();
  const [roles, setRoles] = useState<string[]>(["general"]);
  const [err, setErr] = useState("");
  const [link, setLink] = useState("");
  const list = ORDER.slice().reverse().filter((r) => r !== "admin");
  return (
    <>
      <h3>&quot;{p.name}&quot; का लागि निम्तो लिंक</h3>
      <p className="mut">
        यो लिंक यिनै व्यक्तिको प्रोफाइलका लागि मात्र हो, एकपटक मात्र चल्छ र १४ दिनमा सकिन्छ। लिंक हात पर्ने जोसुकैले लगइन गरे यो प्रोफाइल पाउँछ, त्यसैले सही व्यक्तिलाई मात्र पठाउनुहोस्।
      </p>
      <div className="roles">
        {list.map((r) => (
          <label className="rcb" key={r}>
            <input
              type="checkbox"
              checked={roles.includes(r)}
              onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))}
            />{" "}
            {ROLE_L[r]}
          </label>
        ))}
      </div>
      <div className="msg" id="fm">{err}</div>
      {link && (
        <div id="ivo">
          <label>
            लिंक
            <input readOnly value={link} onClick={(e) => (e.target as HTMLInputElement).select()} />
          </label>
          <p className="mut">सन्देशसहित कपी भयो। पुरानो लिंक भएको भए रद्द भयो।</p>
        </div>
      )}
      <div className="row">
        <button
          onClick={async () => {
            if (!roles.length) return setErr("कम्तिमा एक भूमिका छान्नुहोस्।");
            const { data, error } = await db.rpc("create_invite", { p_person: p.id, p_roles: roles });
            if (error) return setErr(error.message);
            const l = `${siteUrl()}?invite=${data}`;
            navigator.clipboard?.writeText(`नमस्ते ${p.name}! हाम्रो वंशावलीमा तपाईंको प्रोफाइलमा जोडिन यो लिंक खोल्नुहोस्: ${l}`).catch(() => {});
            setErr("");
            setLink(l);
          }}
        >
          लिंक बनाउने
        </button>
        <button className="ghost" onClick={closeDialog}>बन्द</button>
      </div>
    </>
  );
}

// ---------------- kinship reference ("म फलानाको … हुँ") ----------------
const ANCHOR_LABEL: [string, string][] = [
  ["son", "छोरा"], ["daughter", "छोरी"], ["father", "बुबा"], ["mother", "आमा"],
  ["husband", "पति"], ["wife", "पत्नी"], ["brother", "दाजु / भाइ"], ["sister", "दिदी / बहिनी"],
];

/** Sets who the kinship terms are counted from. `userId` set = an admin choosing for another member. */
export function AnchorDialog({ userId, current, onDone }: { userId?: string; current?: { target_id: string; relation_type: string } | null; onDone?: () => void }) {
  const { db, g, perms, me, closeDialog, toast, boot } = useVansh();
  const cur = userId ? current : me?.custom_anchor;
  const [rel, setRel] = useState(cur?.relation_type || "son");
  const sx = useSx({ value: cur?.target_id, label: cur?.target_id ? g.byId[cur.target_id]?.name || "" : "" });
  const [err, setErr] = useState("");
  const opts = personOptions(g, perms, (p) => {
    const f = p.father_id ? g.byId[p.father_id] : null;
    return (f ? " (बुबा: " + f.name + ")" : "") + (p.birth_bs ? " · " + String(p.birth_bs).slice(0, 4) : "");
  });
  const save = async (clear: boolean) => {
    if (!clear && !sx.value) return setErr("सूचीबाट व्यक्ति छान्नुहोस्।");
    const args = clear ? { p_target: null, p_rel: null } : { p_target: sx.value, p_rel: rel };
    const { error } = userId ? await db.rpc("admin_set_anchor", { p_user: userId, ...args }) : await db.rpc("set_my_anchor", args);
    if (error) return setErr(error.message);
    toast(clear ? "सन्दर्भ हटाइयो" : "✅ सन्दर्भ सुरक्षित भयो");
    closeDialog();
    if (!userId) await boot();
    onDone?.();
  };
  return (
    <>
      <h3>🧭 नाता गणनाको सन्दर्भ</h3>
      <p className="mut">
        नाताका शब्द (काका, भतिजा, भिनाजु…) यहाँबाट गनिन्छन्। {userId ? "यो सदस्य" : "म"} वंशावलीमा कसैको छोरा/छोरी, पति/पत्नी, दाजुभाइ… हुँ भनेर जनाउनुहोस्। तोकिएको स्थान भए त्यो भन्दा यही सन्दर्भ पहिले प्रयोग हुन्छ।
      </p>
      <label>
        {userId ? "यो सदस्य" : "म"} यिनको…
        <select value={rel} onChange={(e) => setRel(e.target.value)}>
          {ANCHOR_LABEL.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        हुँ — व्यक्ति
        <Sx st={sx} options={opts} />
      </label>
      <div className="msg">{err}</div>
      <div className="row">
        <button onClick={() => save(false)}>सुरक्षित गर्ने</button>
        {cur && <button className="bad" onClick={() => save(true)}>सन्दर्भ हटाउने</button>}
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- add email/password to a Google/Facebook account ----------------
export function PasswordDialog() {
  const { db, closeDialog, toast, me } = useVansh();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    if (a.length < 6) return setErr("पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।");
    if (a !== b) return setErr("दुई पासवर्ड मिलेन।");
    const { error } = await db.auth.updateUser({ password: a });
    if (error) return setErr(error.message);
    toast("✅ अब इमेल र पासवर्डले पनि लगइन गर्न सकिन्छ");
    closeDialog();
  };
  return (
    <>
      <h3>🔑 इमेल / पासवर्ड जोड्ने</h3>
      <p className="mut">
        तपाईं Google/Facebook बाट लगइन हुनुभएको छ। पासवर्ड राखेपछि <b>{me?.email}</b> र यो पासवर्डले पनि लगइन गर्न सकिन्छ।
      </p>
      <PasswordField label="नयाँ पासवर्ड" value={a} onChange={setA} autoComplete="new-password" />
      <PasswordField label="पासवर्ड फेरि लेख्नुहोस्" value={b} onChange={setB} autoComplete="new-password" onEnter={save} />
      <div className="msg">{err}</div>
      <div className="row">
        <button onClick={save}>सुरक्षित गर्ने</button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}
