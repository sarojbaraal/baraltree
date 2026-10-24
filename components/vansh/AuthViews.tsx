"use client";
// Login / signup / forgot password, new-password, identity (position) request and "waiting for approval" screens.
import React, { useEffect, useState } from "react";
import { useVansh } from "./VanshContext";
import { DateField, PasswordField } from "./ui";
import InvitePreview from "./InvitePreview";

type Mode = "login" | "signup" | "forgot";
const TITLE: Record<Mode, string> = { login: "स्वागतम् !", signup: "खाता बनाउनुहोस्", forgot: "पासवर्ड रिसेट" };
const SUBTITLE: Record<Mode, string> = {
  login: "तपाईंको वंशावली हेर्न लगईन गर्नुहोस्।",
  signup: "आफ्नो परिवारको इतिहास सुरक्षित गर्नुहोस्",
  forgot: "चिन्ता नगर्नुहोस्, हामी मद्दत गर्छौं",
};
const BTN: Record<Mode, string> = { login: "लगइन गर्नुहोस्", signup: "खाता बनाउनुहोस्", forgot: "रिसेट लिंक पठाउनुहोस्" };

/** Optional contact details asked at sign-up (stored on the profile, copied to the person on approval). */
function ContactFields({ v, set, hint }: { v: { bd: string; ph: string; loc: string }; set: (k: "bd" | "ph" | "loc", x: string) => void; hint?: boolean }) {
  return (
    <div className={hint ? "ctf hint" : "ctf"}>
      <label>
        जन्म मिति (वि.सं.)
        <DateField value={v.bd} onChange={(x) => set("bd", x)} />
      </label>
      <label>
        फोन नम्बर
        <input type="tel" inputMode="tel" value={v.ph} onChange={(e) => set("ph", e.target.value)} autoComplete="tel" placeholder="९८XXXXXXXX" />
      </label>
      <label>
        हाल बसोबास गरेको ठाउँ
        <input value={v.loc} onChange={(e) => set("loc", e.target.value)} autoComplete="address-level2" placeholder="जस्तै: काठमाडौं, कोटेश्वर" />
      </label>
    </div>
  );
}
const NUDGE = "कम्तिमा जन्म मिति र फोन नम्बर राखिदिनुहोस् — एडमिनलाई तपाईंलाई वंशावलीमा सही व्यक्तिसँग जोड्न सजिलो हुन्छ। नराख्ने हो भने फेरि थिच्नुहोस्, यसबिना पनि पठाइनेछ।";

const siteUrl = () => `${location.origin}${location.pathname}`;

function Say({ m }: { m: { t: string; ok?: boolean } | null }) {
  return (
    <div className="msg" id="am" role="status" style={{ color: m?.ok ? "var(--success)" : "var(--bad)" }}>
      {m?.t || ""}
    </div>
  );
}

export function AuthView() {
  const { db, invite } = useVansh();
  const [mode, setMode] = useState<Mode>("login");
  const [viaOauth, setViaOauth] = useState(false);
  useEffect(() => {
    try { setViaOauth(localStorage.getItem("vv_oauth") === "1"); } catch {}
  }, []);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [fn, setFn] = useState("");
  const [cf, setCf] = useState("");
  const [cg, setCg] = useState("");
  const [ct, setCt] = useState({ bd: "", ph: "", loc: "" });
  const setC = (k: "bd" | "ph" | "loc", x: string) => setCt((o) => ({ ...o, [k]: x }));
  const [nudged, setNudged] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [inv, setInv] = useState<{ name: string | null; checked: boolean }>({ name: null, checked: false });
  const [busy, setBusy] = useState(false);
  const [pvDone, setPvDone] = useState(false);
  const token = invite();

  useEffect(() => {
    if (!token) return;
    db.rpc("invite_info", { p_token: token }).then(({ data }) => {
      const r = (data as { person_name: string }[] | null)?.[0];
      setInv({ name: r?.person_name ?? null, checked: true });
    });
  }, [db, token]);

  const say = (t: string, ok?: boolean) => setMsg({ t, ok });

  const go = async () => {
    if (busy) return;
    const e = email.trim();
    if (!e) return say("इमेल लेख्नुहोस्।");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await db.auth.signInWithPassword({ email: e, password: pw });
        if (error) say(error.message);
        else try { localStorage.removeItem("vv_oauth"); } catch {}
      } else if (mode === "signup") {
        const name = fn.trim();
        if (!name) return say("पूरा नाम लेख्नुहोस्।");
        if (pw.length < 8) return say("पासवर्ड कम्तिमा ८ अक्षरको हुनुपर्छ ल!");
        if (!token && (!cf.trim() || !cg.trim())) return say("बुबा र हजुरबुबाको नाम लेख्नुहोस् (थाहा नभए 'थाहा छैन' लेख्नुहोस्)।");
        if (!nudged && !ct.bd.trim() && !ct.ph.trim()) {
          setNudged(true);
          return say(NUDGE);
        }
        const { error } = await db.auth.signUp({
          email: e,
          password: pw,
          options: {
            data: { full_name: name, claim_father: cf.trim() || null, claim_grand: cg.trim() || null, invite: token || null, birth_bs: ct.bd.trim() || null, phone: ct.ph.trim() || null, location: ct.loc.trim() || null },
          },
        });
        say(
          error
            ? error.message
            : token
            ? "खाता बन्यो। इमेल खोलेर ईन्बक्स र स्पाम दुबै चेक गर्नुहोस्, अनि लगइन गर्नुहोस्।"
            : "तपाईंको एकाउन्ट बनेको छ। इमेल पुष्टि गर्न ईन्बक्स र स्पाम चेक गर्नुहोस्। एडमिनले स्वीकृत गरेपछि २४ घण्टा भित्रमा तपाईंले साइटमा पहुँच पाउनुहुनेछ।",
          !error
        );
      } else {
        const { error } = await db.auth.resetPasswordForEmail(e, { redirectTo: siteUrl() });
        say(error ? error.message : "यो इमेलको खातामा रिसेट लिंक पठाएको छ। इनबक्स र स्प्याम जाँच्नुहोस् त!", !error);
      }
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "facebook") => {
    try { localStorage.setItem("vv_oauth", "1"); } catch {}
    const { error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } });
    if (error) say(error.message);
  };

  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && go();
  const switchMode = (m: Mode) => {
    setMode(m);
    setMsg(null);
  };

  return (
    <div className="auth-wrap">
      {token && inv.name && !pvDone && (
        <InvitePreview
          token={token}
          name={inv.name}
          onDone={() => {
            setPvDone(true);
            switchMode("signup");
          }}
        />
      )}
      <div className="auth-visual">
        <div className="auth-visual-content">
          <div className="auth-mandala">
            <div className="auth-mandala-core">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="2.5" />
                <circle cx="6" cy="17" r="2" />
                <circle cx="18" cy="17" r="2" />
                <path d="M12 7.5v4M12 11.5L6 15M12 11.5L18 15" />
              </svg>
            </div>
          </div>
          <h2>
            बरालको नाता,
            <br />
                   डिजिटल खाता
          </h2>
          <p>बराल परिवारको लामो इतिहास, पुर्खाको योगदान र ऐतिहासिक बसाइँसराइलाई डिजिटल माध्यममा जीवन्त राख्न यो वंशावलीको सुरुवात गरिएको हो। भौगोलिक रूपमा हामी जहाँ भए पनि, आफ्नो मूल जग र रगतको नातालाई एकै ठाउँमा जोड्ने यो हाम्रो साझा चौतारी हो।</p>
          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span>पुस्तौं सम्मको वंशवृक्ष</span>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <span>सबै बराल एकै ठाउँमा</span>
            </div>
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span>सुरक्षित र निजी डाटा</span>
            </div>
          </div>
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-card">
          <div className="auth-badge">
            <svg viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
            </svg>{" "}
            हाम्रो वंशावली
          </div>
          <h2>{TITLE[mode]}</h2>
          <p className="auth-subtitle">{SUBTITLE[mode]}</p>
          {token && inv.checked && (
            <p className="msg" style={{ color: inv.name ? "var(--success)" : undefined, textAlign: "center" }}>
              {inv.name ? (
                <>
                  🎟 तपाईंलाई <b>{inv.name}</b> को प्रोफाइलका लागि निम्तो आएको छ। लगइन वा खाता बनाउनुहोस्।
                </>
              ) : (
                "यो निम्तो लिंक अमान्य छ वा म्याद सकिएको छ।"
              )}
            </p>
          )}
          {mode === "signup" && (
            <>
              <label>
                पूरा नाम
                <input value={fn} onChange={(e) => setFn(e.target.value)} onKeyDown={onEnter} autoComplete="name" placeholder="तपाईंको नाम" />
              </label>
              {!token && (
                <>
                  <label>
                    तपाईंको बुबाको नाम के हो?
                    <input value={cf} onChange={(e) => setCf(e.target.value)} onKeyDown={onEnter} placeholder="बुबाको पूरा नाम" />
                  </label>
                  <label>
                    तपाईंको हजुरबुबाको नाम के हो?
                    <input value={cg} onChange={(e) => setCg(e.target.value)} onKeyDown={onEnter} placeholder="हजुरबुबाको पूरा नाम" />
                  </label>
                </>
              )}
              <ContactFields v={ct} set={setC} hint={nudged} />
            </>
          )}
          <label>
            इमेल ठेगाना
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} autoComplete="email" placeholder="name@example.com" />
          </label>
          {mode !== "forgot" && (
            <PasswordField
              label={mode === "signup" ? "पासवर्ड (कम्तिमा ८ अक्षर)" : "पासवर्ड"}
              value={pw}
              onChange={setPw}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onEnter={go}
            />
          )}
          <Say m={msg} />
          <div className="row" style={{ marginTop: "1.5rem" }}>
            <button id="go" style={{ width: "100%", padding: "0.8rem", fontSize: "0.95rem" }} onClick={go} disabled={busy}>
              {BTN[mode]}
            </button>
          </div>
          {mode !== "forgot" && (
            <>
              <div className="auth-divider">वा</div>
              <div className="oauth">
                <button type="button" onClick={() => oauth("google")}>
                  <svg viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
                    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
                    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
                  </svg>
                  Google
                </button>
                <button type="button" onClick={() => oauth("facebook")}>
                  <svg viewBox="0 0 24 24">
                    <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
                  </svg>
                  Facebook
                </button>
              </div>
            </>
          )}
          <div className="auth-footer-links">
            {mode === "login" ? (
              <>
                {viaOauth ? (
                  <p className="mut" style={{ textAlign: "center", fontSize: "0.85rem" }}>
                    पछिल्लो पटक Google/Facebook बाट लगइन गर्नुभएको थियो। पासवर्ड राख्न लगइनपछि 🔑 थिच्नुहोस्।
                    <br />
                    <button className="lnk" onClick={() => { try { localStorage.removeItem("vv_oauth"); } catch {} setViaOauth(false); }}>मसँग पासवर्ड छ</button>
                  </p>
                ) : (
                  <p className="mut">
                    <button className="lnk" onClick={() => switchMode("forgot")}>पासवर्ड बिर्सनुभयो?</button>
                  </p>
                )}
                <div className="auth-divider">वा</div>
                <p className="mut">
                  <button className="lnk" onClick={() => switchMode("signup")}>नयाँ खाता बनाउनुहोस्</button>
                </p>
              </>
            ) : (
              <p className="mut">
                <button className="lnk" onClick={() => switchMode("login")}>पहिले नै खाता छ? लगइन गर्नुहोस्</button>
              </p>
            )}
          </div>
          <details className="auth-faq">
            <summary>यो साइट के हो र मेरो डाटा कति सुरक्षित छ?</summary>
            <dl>
              <dt>यो साइट के हो?</dt>
              <dd>बराल परिवारको वंशावली — को कसको छोरा/छोरी, को कुन पुस्ता र कसको कुन नाता हो भन्ने निजी परिवार-रेकर्ड। सार्वजनिक वेबसाइट होइन।</dd>
              <dt>को के हेर्न सक्छ?</dt>
              <dd>खाता बनाएपछि एडमिनले स्वीकृत गरेमा मात्र पहुँच खुल्छ। विवाहित छोरी-चेलीका ससुराली परिवारका शाखा साधारण सदस्यका लागि बन्द (नाम लुकेको) रहन्छन्।</dd>
              <dt>इमेल र फोन कसले देख्छ?</dt>
              <dd>इमेल र फोन नम्बर एडमिन/मोडरेटर र सम्बन्धित व्यक्ति आफैँले मात्र देख्न सक्छन्।</dd>
              <dt>पासवर्ड र लगइन?</dt>
              <dd>पासवर्ड Supabase Auth ले hash गरेर राख्छ — हामीले पढ्न सक्दैनौं। Google बाट पनि लगइन गर्न मिल्छ।</dd>
              <dt>जो कसैले जे पनि बदल्न सक्छ?</dt>
              <dd>सदस्यले गरेको सुझाव/परिवर्तन एडमिनले स्वीकृत गरेपछि मात्र वंशावलीमा लागू हुन्छ। डाटाबेसमै पहुँच नियम (RLS) लागू छ, त्यसैले ब्राउजरबाट बाइपास गर्न मिल्दैन।</dd>
            </dl>
          </details>
          {mode === "signup" && (
            <p className="mut" style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.82rem" }}>
              खाता बनेपछि एडमिनले स्वीकृत गर्नेछन्।
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResetView() {
  const { db, boot, setRecovering } = useVansh();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const go = async () => {
    if (a.length < 8) return setMsg({ t: "पासवर्ड कम्तिमा ८ अक्षरको हुनुपर्छ।" });
    if (a !== b) return setMsg({ t: "दुईटा पासवर्ड मिलेन नि।" });
    const { error } = await db.auth.updateUser({ password: a, data: { must_change_password: false } });
    if (error) return setMsg({ t: error.message });
    setRecovering(false);
    boot();
  };
  return (
    <div className="auth-wrap">
      <div className="auth-visual">
        <div className="auth-visual-content">
          <div className="auth-mandala">
            <div className="auth-mandala-core">
              <svg viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </div>
          <h2>नयाँ सुरुवात</h2>
          <p>सुरक्षित नयाँ पासवर्ड राख्नुहोस्।</p>
        </div>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-card">
          <h2>नयाँ पासवर्ड</h2>
          <p className="auth-subtitle">बलियो पासवर्ड छान्नुहोस्</p>
          <PasswordField label="नयाँ पासवर्ड कम्तिमा ८ अक्षरको होस् है" value={a} onChange={setA} autoComplete="new-password" onEnter={go} />
          <PasswordField label="यहाँ फेरि पासवर्ड लेख्नुहोस्" value={b} onChange={setB} autoComplete="new-password" onEnter={go} />
          <Say m={msg} />
          <div className="row" style={{ marginTop: "1.5rem" }}>
            <button id="go" style={{ width: "100%", padding: "0.8rem" }} onClick={go}>
              पासवर्ड बदल्नुहोस्
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PosView() {
  const { db, me, boot } = useVansh();
  const [n, setN] = useState(me?.full_name || "");
  const [f, setF] = useState("");
  const [gr, setGr] = useState("");
  const [ct, setCt] = useState({ bd: "", ph: "", loc: "" });
  const [nudged, setNudged] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const go = async () => {
    if (!n.trim() || !f.trim() || !gr.trim()) return setMsg({ t: "नाम, बुबा र हजुरबुबाको नाम लेख्नुहोस् (थाहा नभए 'थाहा छैन' लेख्नुहोस्)।" });
    if (!nudged && !ct.bd.trim() && !ct.ph.trim()) {
      setNudged(true);
      return setMsg({ t: NUDGE });
    }
    const { error } = await db.rpc("submit_identity", { p_name: n.trim(), p_father: f.trim(), p_grand: gr.trim(), p_birth: ct.bd.trim(), p_phone: ct.ph.trim(), p_location: ct.loc.trim() });
    if (error) return setMsg({ t: error.message });
    boot();
  };
  return (
    <div className="card">
      <h2>तपाईं को हुनुहुन्छ? आफुलाई चिनाउनुहोस्</h2>
      <p className="mut">एडमिनले तपाईंलाई वंशावलीमा चिनेर स्थान र भूमिका तोक्नेछन्।</p>
      <label>
        तपाईंको पूरा नाम
        <input value={n} onChange={(e) => setN(e.target.value)} />
      </label>
      <label>
        तपाईंको बुबाको नाम के हो?
        <input value={f} onChange={(e) => setF(e.target.value)} />
      </label>
      <label>
        तपाईंको हजुरबुबाको नाम के हो?
        <input value={gr} onChange={(e) => setGr(e.target.value)} />
      </label>
      <ContactFields v={ct} set={(k, x) => setCt((o) => ({ ...o, [k]: x }))} hint={nudged} />
      <Say m={msg} />
      <div className="row">
        <button id="go" onClick={go}>पठाउने</button>
      </div>
    </div>
  );
}

export function PendingView() {
  const { me } = useVansh();
  return (
    <div className="card">
      <h2>स्वीकृतिको पर्खाइमा</h2>
      <p>तपाईंको एकाउन्ट बनेको छ। एडमिनले स्वीकृत गरेपछि २४ घण्टा भित्रमा तपाईंले साइटमा पहुँच पाउनुहुनेछ।</p>
      <p className="mut">
        तपाईंले दिएको: बुबा — {me?.claim_father || "—"} · हजुरबुबा — {me?.claim_grand || "—"}
      </p>
    </div>
  );
}