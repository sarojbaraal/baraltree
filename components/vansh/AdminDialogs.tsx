"use client";
// Admin dialogs: import preview and "create account" (ported from the original app.js previewImport / acctForm).
import { webUrl } from "@/lib/vansh/native";
import React, { useState, useSyncExternalStore } from "react";
import { AVATAR_FILES, getSiteAvatars, loadSiteAvatars, subscribeSiteAvatars, type SiteAvatars } from "@/lib/vansh/avatars";
import { IMPORT_LABELS, type ImportDiff } from "@/lib/vansh/importer";
import { ORDER, ROLE_L } from "@/lib/vansh/graph";
import { fbOk, np } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";

const rowStyle: React.CSSProperties = { padding: ".55rem 0", borderBottom: "1px solid var(--line)", fontSize: ".88rem" };

export function ImportPreview({
  diff, kept, dateWarn, onResolve,
}: { diff: ImportDiff; kept: number; dateWarn: number; onResolve: (ok: boolean) => void }) {
  const { add, chg, same, cleared } = diff;
  const none = !add.length && !chg.length;
  return (
    <>
      <h3>आयात अघि तुलना</h3>
      <p>
        <b>{np(add.length)}</b> नयाँ · <b>{np(chg.length)}</b> परिवर्तन · <b>{np(same)}</b> उस्तै
        {kept ? (
          <>
            {" "}· <b>{np(kept)}</b> फाइलमा नभएका (जस्ताको तस्तै)
          </>
        ) : null}
      </p>
      {cleared > 0 && <p className="msg">⚠ {np(cleared)} ठाउँमा भरिएको डाटा खाली भएर मेटिन्छ। जाँच्नुहोस्।</p>}
      {dateWarn > 0 && <p className="msg">⚠ {np(dateWarn)} मिति Excel ले मितिमा बदलेको देखियो; जाँच्नुहोस्।</p>}
      {none && <div className="card">कुनै परिवर्तन छैन।</div>}
      {add.length > 0 && (
        <details open={!chg.length}>
          <summary>
            <b>नयाँ थपिने ({np(add.length)})</b>
          </summary>
          {add.map((v, i) => (
            <div key={i} style={rowStyle}>
              <b>➕ {v.name}</b>
              <br />
              <span className="mut">
                {[v.father && "बुबा: " + v.father, v.mother && "आमा: " + v.mother, v.spouse && "पति/पत्नी: " + v.spouse, v.birth_bs]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
            </div>
          ))}
        </details>
      )}
      {chg.length > 0 && (
        <details open>
          <summary>
            <b>परिवर्तन हुने ({np(chg.length)})</b>
          </summary>
          {chg.map((x, i) => (
            <div key={i} style={rowStyle}>
              <b>{x.n}</b>
              {x.ch.map((c) => (
                <React.Fragment key={c.k}>
                  <br />
                  {IMPORT_LABELS[c.k]}: <s className="mut">{c.a || "खाली"}</s> →{" "}
                  {c.b ? <b>{c.b}</b> : <b style={{ color: "var(--bad)" }}>खाली (मेटिन्छ)</b>}
                </React.Fragment>
              ))}
            </div>
          ))}
        </details>
      )}
      <div className="row">
        <button disabled={none} onClick={() => onResolve(true)}>लागू गर्ने</button>
        <button className="ghost" onClick={() => onResolve(false)}>रद्द</button>
      </div>
    </>
  );
}

const genPw = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

export function AcctDialog({ onDone }: { onDone: () => void }) {
  const { db, g, closeDialog, toast } = useVansh();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState(genPw);
  const [pos, setPos] = useState("");
  const [roles, setRoles] = useState<string[]>(["general"]);
  const [fb, setFb] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const site = webUrl();

  if (done)
    return (
      <>
        <h3>✅ खाता बन्यो</h3>
        <p>
          {done.split("\n").map((l, i) => (
            <React.Fragment key={i}>
              {l}
              <br />
            </React.Fragment>
          ))}
        </p>
        <div className="row">
          <button onClick={() => { navigator.clipboard?.writeText(done); toast("कपी भयो"); }}>कपी</button>
          <button className="ghost" onClick={() => { closeDialog(); onDone(); }}>बन्द</button>
        </div>
      </>
    );

  return (
    <>
      <h3>नयाँ खाता बनाउने</h3>
      <label>
        पूरा नाम *
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        इमेल (खाता बनाउन चाहिन्छ)
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        अस्थायी पासवर्ड
        <span style={{ display: "flex", gap: ".4rem" }}>
          <input value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="ghost" onClick={() => setPw(genPw())}>🔄</button>
        </span>
      </label>
      <label>
        वंशावलीमा को हुन्?
        <select value={pos} onChange={(e) => setPos(e.target.value)}>
          <option value="">— स्थान तोकिएको छैन —</option>
          {g.people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <div className="roles">
        {ORDER.slice().reverse().map((r) => (
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
      <label>
        Facebook लिंक (इमेल नभए निम्तोका लागि)
        <input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="https://facebook.com/..." />
      </label>
      <p className="mut">इमेल निम्तो पठाइँदैन। पहिलो लगइनमा पासवर्ड बदल्नैपर्छ।</p>
      <div className="msg" id="fm">{err}</div>
      <div className="row">
        <button
          onClick={async () => {
            const full_name = name.trim();
            const em = email.trim();
            if (!full_name || !em) return setErr("नाम र इमेल अनिवार्य छ।");
            if (pw.length < 8 || !roles.length) return setErr("पासवर्ड ८+ अक्षर र कम्तिमा एक भूमिका चाहिन्छ।");
            const { error } = await db.functions.invoke("create-user", {
              body: { full_name, email: em, password: pw, roles, position_person_id: pos || null },
            });
            if (error) {
              let m = error.message;
              try {
                m = (await (error as unknown as { context: Response }).context.json()).error || m;
              } catch {}
              return setErr(m);
            }
            const t = `साइट: ${site}\nइमेल: ${em}\nअस्थायी पासवर्ड: ${pw}\nपहिलो लगइनमा पासवर्ड बदल्नुपर्छ।`;
            navigator.clipboard?.writeText(t).catch(() => {});
            setDone(t);
          }}
        >
          खाता बनाउने
        </button>
        <button
          className="ghost"
          onClick={() => {
            navigator.clipboard
              ?.writeText(`नमस्ते! हाम्रो वंशावलीमा सामेल हुनुहोस्: ${site} — "नयाँ खाता बनाउनुहोस्" मा आफ्नो स्थान छानेर दर्ता गर्नुहोस्।`)
              .catch(() => {});
            toast("सन्देश कपी भयो — Facebook मा paste गर्नुहोस्");
            if (fbOk(fb.trim())) window.open(fb.trim(), "_blank", "noopener");
          }}
        >
          Facebook निम्तो
        </button>
        <button className="ghost" onClick={closeDialog}>रद्द</button>
      </div>
    </>
  );
}

// ---------------- site-wide default avatars ----------------
const EXT: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };

export function AvatarsDialog() {
  const { db, closeDialog, toast } = useVansh();
  const [busy, setBusy] = useState<"M" | "F" | null>(null);
  const [err, setErr] = useState("");
  const site = useSyncExternalStore(subscribeSiteAvatars, getSiteAvatars, () => ({}) as SiteAvatars);

  const clear = async (g: "M" | "F") => {
    const { data } = await db.storage.from("site-assets").list("", { limit: 50 });
    const old = (data || []).filter((o) => o.name.split(".")[0] === AVATAR_FILES[g]).map((o) => o.name);
    if (old.length) await db.storage.from("site-assets").remove(old);
  };
  const upload = async (g: "M" | "F", f?: File | null) => {
    if (!f) return;
    const ext = EXT[f.type];
    if (!ext) return setErr("SVG, PNG, WEBP वा JPG फाइल मात्र चल्छ।");
    if (f.size > 512 * 1024) return setErr("फाइल ५१२ KB भन्दा सानो हुनुपर्छ।");
    setErr("");
    setBusy(g);
    try {
      await clear(g);
      const { error } = await db.storage.from("site-assets").upload(`${AVATAR_FILES[g]}.${ext}`, f, { contentType: f.type, upsert: true });
      if (error) throw error;
      await loadSiteAvatars(db);
      toast("✅ अवतार बदलियो");
    } catch (e) {
      setErr((e as Error).message + " — site-assets भण्डारको SQL चलाइसक्नुभएको छ?");
    } finally {
      setBusy(null);
    }
  };
  const reset = async (g: "M" | "F") => {
    setBusy(g);
    try {
      await clear(g);
      await loadSiteAvatars(db);
      toast("डिफल्ट अवतार फर्कियो");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h3>🖼 डिफल्ट अवतार</h3>
      <p className="mut">फोटो नभएका सबै सदस्यमा यही देखिन्छ। फाइल नराखे अहिलेको मूल चित्र नै चल्छ।</p>
      <div className="avset">
        {(["M", "F"] as const).map((g) => (
          <div key={g} className="card">
            <div className={`mav2 g${g}`} style={{ margin: "0 auto .6rem" }}>
              <Avatar g={g} />
            </div>
            <b>{g === "M" ? "पुरुष" : "महिला"}</b>
            <label className="filebtn">
              <input type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" disabled={!!busy} onChange={(e) => { upload(g, e.target.files?.[0]); e.target.value = ""; }} />
              <span>{busy === g ? "राख्दै…" : "फाइल छान्नुहोस्"}</span>
            </label>
            {site[g] && <button className="bad" disabled={!!busy} onClick={() => reset(g)}>मूल चित्र फर्काउने</button>}
          </div>
        ))}
      </div>
      <div className="msg">{err}</div>
      <div className="row">
        <button className="ghost" onClick={closeDialog}>बन्द</button>
      </div>
    </>
  );
}
