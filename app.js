// ====== यहाँ आफ्नो Supabase को Project URL र anon public key राख्नुहोस् ======
const CFG = { url: "https://onhznyefbseptuwurqxx.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uaHpueWVmYnNlcHR1d3VycXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NTM5NDUsImV4cCI6MjEwNjMyOTk0NX0.4o8tWadbJZ29uXaW7Gbn_2IinDLVtsda757kz-be1z0" };
const db = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LABEL = {name:"नाम",gender:"लिङ्ग",father_id:"बुबा",mother_id:"आमा",spouse_id:"पति/पत्नी",father_name:"बुबा (नयाँ नाम)",mother_name:"आमा (नयाँ नाम)",spouse_name:"पति/पत्नी (नयाँ नाम)",is_living:"जीवित",birth_bs:"जन्म मिति (BS)",death_bs:"मृत्यु मिति (BS)",phone:"फोन",address:"ठेगाना",notes:"टिप्पणी"};
const FIELDS = Object.keys(LABEL);
let me = null, people = [], byId = {}, sel = null, tab = "tree";

let recovering = false;
db.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") recovering = true; setTimeout(boot, 0); });
async function boot() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { me = null; $("#who").innerHTML = ""; return authView(); }
  if (recovering) return resetView();
  const { data } = await db.from("profiles").select("*").eq("id", session.user.id).single();
  me = data;
  $("#who").innerHTML = `${esc(me?.full_name || me?.email)} <span class="tag">${esc(me?.role)}</span> <button class="ghost" id="out">बाहिर</button>`;
  $("#out").onclick = () => db.auth.signOut();
  if (!me || me.role === "pending") return $("#app").innerHTML =
    `<div class="card"><h2>स्वीकृतिको पर्खाइमा</h2><p>तपाईंको खाता बनिसकेको छ। एडमिनले स्वीकृत गरेपछि वंशावली हेर्न पाउनुहुनेछ।</p></div>`;
  await load(); render();
}
async function load() {
  const { data, error } = await db.from("people").select("*").order("created_at");
  if (error) return alert(error.message);
  people = data; byId = Object.fromEntries(people.map(p => [p.id, p]));
}

// ---------- लगइन / दर्ता / पासवर्ड रिसेट — PREMIUM UI ----------
const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = EYE.replace("</svg>", '<path d="M3 3l18 18"/></svg>');
const pwField = (id, label, ac) => `<label>${label}<span class="pw"><input id="${id}" type="password" autocomplete="${ac}"><button type="button" class="eye" data-for="${id}" aria-label="पासवर्ड देखाउनुहोस्">${EYE}</button></span></label>`;
function wireEyes() {
  document.querySelectorAll(".eye").forEach(b => b.onclick = () => {
    const i = $("#" + b.dataset.for), show = i.type === "password";
    i.type = show ? "text" : "password"; b.innerHTML = show ? EYE_OFF : EYE;
    b.setAttribute("aria-label", show ? "पासवर्ड लुकाउनुहोस्" : "पासवर्ड देखाउनुहोस्");
  });
}
const say = (t, ok) => { const m = $("#am"); m.textContent = t; m.style.color = ok ? "var(--success)" : "var(--bad)"; };

function authView(mode = "login") {
  const TITLE = { login: "स्वागत छ", signup: "खाता बनाउनुहोस्", forgot: "पासवर्ड रिसेट" };
  const SUBTITLE = {
    login: "तपाईंको वंशावलीमा फेरि स्वागत छ",
    signup: "आफ्नो परिवारको इतिहास सुरक्षित गर्नुहोस्",
    forgot: "चिन्ता नगर्नुहोस्, हामी मद्दत गर्छौं"
  };
  const BTN = { login: "लगइन गर्नुहोस्", signup: "खाता बनाउनुहोस्", forgot: "रिसेट लिंक पठाउनुहोस्" };

  $("#app").classList.remove("wide");
  $("#app").innerHTML = `
    <div class="auth-wrap">
      <div class="auth-visual">
        <div class="auth-visual-content">
          <div class="auth-mandala">
            <div class="auth-mandala-core">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="2.5"/>
                <circle cx="6" cy="17" r="2"/>
                <circle cx="18" cy="17" r="2"/>
                <path d="M12 7.5v4M12 11.5L6 15M12 11.5L18 15"/>
              </svg>
            </div>
          </div>
          <h2>सबै बराल,<br>एकै ठाउँमा</h2>
          <p>हाम्रो वंशावलीले बराल परिवारको इतिहास, नाता र सम्बन्धलाई सुन्दर र सुरक्षित तरिकाले जोड्छ।</p>
          <div class="auth-features">
            <div class="auth-feature">
              <div class="auth-feature-icon"><svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
              <span>पुस्तौं सम्मको वंशवृक्ष</span>
            </div>
            <div class="auth-feature">
              <div class="auth-feature-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
              <span>सबै बराल एकै ठाउँमा</span>
            </div>
            <div class="auth-feature">
              <div class="auth-feature-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
              <span>सुरक्षित र निजी डाटा</span>
            </div>
          </div>
        </div>
      </div>
      <div class="auth-form-side">
        <div class="auth-form-card">
          <div class="auth-badge">
            <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
            हाम्रो वंशावली
          </div>
          <h2>${TITLE[mode]}</h2>
          <p class="auth-subtitle">${SUBTITLE[mode]}</p>
          ${mode === "signup" ? `<label>पूरा नाम<input id="fn" autocomplete="name" placeholder="तपाईंको नाम"></label>` : ""}
          <label>इमेल ठेगाना<input id="em" type="email" autocomplete="email" placeholder="name@example.com"></label>
          ${mode === "forgot" ? "" : pwField("pw", mode === "signup" ? "पासवर्ड (कम्तिमा ८ अक्षर)" : "पासवर्ड", mode === "signup" ? "new-password" : "current-password")}
          <div class="msg" id="am" role="status"></div>
          <div class="row" style="margin-top:1.5rem"><button id="go" style="width:100%;padding:0.8rem;font-size:0.95rem">${BTN[mode]}</button></div>
          <div class="auth-footer-links">
            ${mode === "login"
              ? `<p class="mut"><button class="lnk" data-m="forgot">पासवर्ड बिर्सनुभयो?</button></p>
                 <div class="auth-divider">वा</div>
                 <p class="mut"><button class="lnk" data-m="signup">नयाँ खाता बनाउनुहोस् →</button></p>`
              : `<p class="mut"><button class="lnk" data-m="login">← पहिले नै खाता छ? लगइन गर्नुहोस्</button></p>`}
          </div>
          ${mode === "signup" ? `<p class="mut" style="text-align:center;margin-top:1rem;font-size:0.82rem">खाता बनेपछि सरोजले स्वीकृत गर्नुपर्छ, त्यतिन्जेल पर्खनुहोस् ल!</p>` : ""}
        </div>
      </div>
    </div>`;
  wireEyes();
  document.querySelectorAll(".lnk").forEach(b => b.onclick = () => authView(b.dataset.m));
  const go = async () => {
    const email = $("#em").value.trim(), password = $("#pw")?.value || "";
    if (!email) return say("इमेल लेख्नुहोस्।");
    if (mode === "login") {
      const { error } = await db.auth.signInWithPassword({ email, password }); if (error) say(error.message);
    } else if (mode === "signup") {
      const name = $("#fn").value.trim();
      if (!name) return say("पूरा नाम लेख्नुहोस्।");
      if (password.length < 8) return say("पासवर्ड कम्तिमा ८ अक्षरको हुनुपर्छ ल!");
      const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
      say(error ? error.message : "खाता बन्यो। इमेल खोलेर ईन्बक्स र स्पाम दुबै चेक गर्नुहोस त! ।", !error);
    } else {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0].split("?")[0] });
      say(error ? error.message : "यो इमेलको खातामा रिसेट लिंक पठाएको छ। इनबक्स र स्प्याम जाँच्नुहोस् त!", !error);
    }
  };
  $("#go").onclick = go;
  document.querySelectorAll("#app input").forEach(i => i.onkeydown = e => { if (e.key === "Enter") go(); });
}

function resetView() {
  $("#app").classList.remove("wide");
  $("#app").innerHTML = `
    <div class="auth-wrap">
      <div class="auth-visual">
        <div class="auth-visual-content">
          <div class="auth-mandala">
            <div class="auth-mandala-core">
              <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
          </div>
          <h2>नयाँ सुरुवात</h2>
          <p>सुरक्षित नयाँ पासवर्ड राख्नुहोस्।</p>
        </div>
      </div>
      <div class="auth-form-side">
        <div class="auth-form-card">
          <h2>नयाँ पासवर्ड</h2>
          <p class="auth-subtitle">बलियो पासवर्ड छान्नुहोस्</p>
          ${pwField("np", "नयाँ पासवर्ड कम्तिमा ८ अक्षरको होस् है", "new-password")}
          ${pwField("np2", "यहाँ फेरि पासवर्ड लेख्नुहोस्", "new-password")}
          <div class="msg" id="am" role="status"></div>
          <div class="row" style="margin-top:1.5rem"><button id="go" style="width:100%;padding:0.8rem">पासवर्ड बदल्नुहोस्</button></div>
        </div>
      </div>
    </div>`;
  wireEyes();
  $("#go").onclick = async () => {
    const a = $("#np").value;
    if (a.length < 8) return say("पासवर्ड कम्तिमा ८ अक्षरको हुनुपर्छ।");
    if (a !== $("#np2").value) return say("दुईटा पासवर्ड मिलेन नि।");
    const { error } = await db.auth.updateUser({ password: a });
    if (error) return say(error.message);
    recovering = false; boot();
  };
}

// ---------- मुख्य दृश्य ----------
function render() {
  const admin = me.role === "admin";
  $("#app").innerHTML = `<nav>
    <button data-t="tree" class="${tab==="tree"?"on":""}">🌳 वंशवृक्ष</button>
    <button data-t="mine" class="${tab==="mine"?"on":""}">📋 मेरा अनुरोध</button>
    ${admin ? `<button data-t="admin" class="${tab==="admin"?"on":""}">⚙ एडमिन</button>` : ""}</nav><div id="pane"></div>`;
  $("#app").classList.toggle("wide", tab === "tree");
  document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
  ({ tree: treeView, mine: mineView, admin: adminView })[tab]();
}

// ---------- वंशवृक्ष ----------
const hasParents = p => p.father_id || p.mother_id;
const kids = p => people.filter(c => c.father_id === p.id || (!c.father_id && c.mother_id === p.id));
const isMarriedIn = p => { const s = byId[p.spouse_id]; if (!s || p.more_spouse_ids?.length) return false; return !!(hasParents(s) || s.more_spouse_ids?.length || s.id < p.id); };
const CW = 176, CH = 72, GAP = 16, HG = 26, VG = 64;
const GEN = ["#E4572E", "#F3A712", "#29A19C", "#3A7CA5", "#7B5EA7", "#D1477A", "#5B8C5A", "#C17C3B"];
const yr = s => (s || "").slice(0, 4);
const byBirth = (a, b) => (a.birth_bs || "9999").localeCompare(b.birth_bs || "9999") || a.created_at.localeCompare(b.created_at);
let V = { x: 0, y: 0, k: 1 }, W = 0, H = 0, cardPos = {}, collapsed = new Set(), collInit = false, HL = null;
let lastCards = [], lastLines = [], lastTrees = [], matches = [], mi = 0;

const spousesOf = p => [p.spouse_id, ...(p.more_spouse_ids || [])].filter(id => id && byId[id]);
const kidsOf = x => people.filter(c => c.father_id === x.id || c.mother_id === x.id);
function build(p, seen, d) {
  seen.add(p.id);
  const sps = spousesOf(p).map(id => byId[id]).filter((s, i, a) => !seen.has(s.id) && a.indexOf(s) === i);
  sps.forEach(s => seen.add(s.id));
  const uniq = a => [...new Map(a.map(k => [k.id, k])).values()].sort(byBirth);
  const groups = sps.length >= 2
    ? [...sps.map(s => ({ from: s.id, ks: uniq(kidsOf(s)) })), { from: null, ks: uniq(kidsOf(p)) }]
    : [{ from: null, ks: uniq([...kids(p), ...(sps[0] ? kids(sps[0]) : [])]) }];
  const all = [];
  groups.forEach(g => g.ks.forEach(k => { if (!seen.has(k.id)) { const c = build(k, seen, d + 1); c.from = g.from; all.push(c); } }));
  return { p, sps, d, w: (sps.length + 1) * CW + sps.length * GAP, all };
}
function measure(n) {
  n.vis = collapsed.has(n.p.id) ? [] : n.all;
  n.vis.forEach(measure);
  n.ct = n.vis.reduce((a, c) => a + c.tw, 0) + HG * Math.max(0, n.vis.length - 1);
  n.tw = Math.max(n.w, n.ct);
}
function rowOf(n) {
  const { p, sps } = n;
  if (!sps.length) return [p];
  if (sps.length === 1) { const s = sps[0]; return p.gender === "F" && s.gender !== "F" ? [s, p] : [p, s]; }
  return [sps[0], p, ...sps.slice(1)];
}
function place(n, x, y, cards, lines, units) {
  const row = rowOf(n), ux = x + (n.tw - n.w) / 2, px = ux + n.w / 2, cx = {};
  row.forEach((q, i) => { const qx = ux + i * (CW + GAP); cards.push({ p: q, x: qx, y, d: n.d }); cx[q.id] = qx + CW / 2; });
  const pi = row.indexOf(n.p);
  n.sps.forEach(s => {
    const si = row.indexOf(s);
    if (Math.abs(si - pi) === 1) { const a = Math.min(si, pi); lines.push({ d: `M${ux + a * (CW + GAP) + CW} ${y + CH / 2}H${ux + (a + 1) * (CW + GAP)}`, c: n.p.id }); }
    else lines.push({ d: `M${cx[n.p.id]} ${y + CH}V${y + CH + 12}H${cx[s.id]}V${y + CH}`, c: n.p.id, m: 1 });
  });
  n.ax = cx[n.p.id];
  if (n.all.length) units.push({ key: n.p.id, px, y, n: n.all.length, open: n.vis.length > 0 });
  let cur = x + (n.tw - n.ct) / 2;
  n.vis.forEach(c => {
    const fx = n.sps.length >= 2 && c.from && cx[c.from] != null ? cx[c.from] : px;
    place(c, cur, y + CH + VG, cards, lines, units);
    lines.push({ d: `M${fx} ${y + CH}V${y + CH + VG / 2}H${c.ax}V${y + CH + VG}`, c: c.p.id });
    cur += c.tw + HG;
  });
}
const cardHtml = ({ p, x, y, d }) => `<div class="cd g${p.gender || "O"} ${p.is_living ? "" : "dead"} ${sel === p.id ? "sel" : ""}" tabindex="0" data-id="${p.id}" style="left:${x}px;top:${y}px;width:${CW}px;height:${CH}px;--gc:${GEN[d % GEN.length]}"><div class="av">${esc(Array.from(p.name)[0])}</div><div class="tx"><b>${esc(p.name)}</b><span>${yr(p.birth_bs) || "?"}${p.is_living ? "" : " – " + (yr(p.death_bs) || "?")}</span></div></div>`;
function draw() {
  const seen = new Set(), cards = [], lines = [], units = [];
  const trees = people.filter(p => !hasParents(p) && !isMarriedIn(p)).sort(byBirth).map(p => build(p, seen, 0));
  people.filter(p => !seen.has(p.id)).forEach(p => trees.push(build(p, seen, 0)));
  if (!collInit && people.length) { collInit = true; const f = n => { if (n.d >= 3 && n.all.length) collapsed.add(n.p.id); n.all.forEach(f); }; trees.forEach(f); }
  let x = 0; trees.forEach(t => { measure(t); place(t, x, 0, cards, lines, units); x += t.tw + HG * 3; });
  W = Math.max(x - HG * 3, CW); H = Math.max(CH, ...cards.map(c => c.y + CH)) + 34;
  lastCards = cards; lastLines = lines; lastTrees = trees; cardPos = Object.fromEntries(cards.map(c => [c.p.id, c]));
  const st = $("#stage"); st.style.cssText = `width:${W}px;height:${H}px`;
  st.innerHTML = `<svg width="${W}" height="${H}">${lines.map(l => `<path class="ln" data-c="${l.c}"${l.m ? ' data-m="1"' : ""} d="${l.d}"/>`).join("")}</svg>` +
    cards.map(cardHtml).join("") +
    units.map(u => `<button class="tg" data-t="${u.key}" style="left:${u.px}px;top:${u.y + CH + 3}px" aria-label="शाखा खोल्ने/बन्द गर्ने">${u.open ? "−" : "+" + u.n}</button>`).join("");
  applyHL();
}
function branchOf(ids) {
  const S = new Set(), addSp = p => spousesOf(p).forEach(s => S.add(s));
  const up = id => { const p = byId[id]; if (!p || S.has(id)) return; S.add(id); addSp(p); up(p.father_id); up(p.mother_id); };
  const down = id => people.filter(c => c.father_id === id || c.mother_id === id).forEach(c => { if (!S.has(c.id)) { S.add(c.id); addSp(c); down(c.id); } });
  ids.forEach(id => { up(id); down(id); const p = byId[id]; if (p) spousesOf(p).forEach(down); });
  return S;
}
function applyHL() {
  document.querySelectorAll(".cd").forEach(c => { const on = HL ? HL.has(c.dataset.id) : null; c.classList.toggle("hl", on === true); c.classList.toggle("dim", on === false); });
  document.querySelectorAll(".ln").forEach(l => { const on = HL ? HL.has(l.dataset.c) : null; l.classList.toggle("on", on === true); l.classList.toggle("dim", on === false); });
}
function clampV() { const c = $("#chart"); if (!c) return; const m = 60; V.x = Math.min(c.clientWidth - m, Math.max(m - W * V.k, V.x)); V.y = Math.min(c.clientHeight - m, Math.max(m - H * V.k, V.y)); }
function applyV() { clampV(); $("#stage").style.transform = `translate(${V.x}px,${V.y}px) scale(${V.k})`; const z = $("#zr"); if (z) z.value = Math.round(V.k * 100); }
function zoomAt(f, cx, cy) {
  const k = Math.min(2.5, Math.max(0.02, V.k * f)), ch = $("#chart");
  if (V.y >= 0 && V.y < ch.clientHeight - 60) cy = V.y; // रूखको माथिल्लो भाग देखिँदै छ भने जुम गर्दा त्यहीँ टाँसिएर रहोस्
  V.x = cx - (cx - V.x) * k / V.k; V.y = cy - (cy - V.y) * k / V.k; V.k = k; applyV();
}
function fit() {
  const c = $("#chart"); V.k = Math.max(0.02, Math.min(1, (c.clientWidth - 40) / W, (c.clientHeight - 40) / H));
  V.x = (c.clientWidth - W * V.k) / 2; V.y = 20; applyV();
}
function home() {
  const c = $("#chart"), fk = Math.min(1, (c.clientWidth - 40) / W, (c.clientHeight - 40) / H);
  if (fk >= 0.55 || !lastTrees.length) return fit();
  V.k = 0.8; V.x = c.clientWidth / 2 - lastTrees[0].ax * 0.8; V.y = 24; applyV();
}
function focusOn(id, k) {
  const q = cardPos[id], c = $("#chart"), st = $("#stage"); if (!q) return;
  if (k) V.k = k;
  V.x = c.clientWidth / 2 - (q.x + CW / 2) * V.k; V.y = c.clientHeight / 2 - (q.y + CH / 2) * V.k;
  st.classList.add("anim"); applyV(); setTimeout(() => st.classList.remove("anim"), 400);
}
function unpick() { sel = null; HL = null; document.querySelectorAll(".cd.sel").forEach(c => c.classList.remove("sel")); applyHL(); $("#det").hidden = true; }
function pick(id) {
  sel = id; HL = branchOf([id]);
  document.querySelectorAll(".cd").forEach(c => c.classList.toggle("sel", c.dataset.id === id));
  applyHL(); detail();
}
const openUp = (id, s = new Set()) => { const p = byId[id]; if (!p || s.has(id)) return; s.add(id); collapsed.delete(id); openUp(p.father_id, s); openUp(p.mother_id, s); openUp(p.spouse_id, s); };
function search(q, next) {
  q = q.trim().toLowerCase(); const qc = $("#qc");
  if (next) { if (matches.length) { mi = (mi + 1) % matches.length; focusOn(matches[mi].id, 1); qc.textContent = `${mi + 1}/${matches.length}`; } return; }
  matches = q ? people.filter(p => p.name.toLowerCase().includes(q)) : []; mi = 0;
  qc.textContent = q ? (matches.length ? `${matches.length} मिल्यो` : "भेटिएन") : "";
  sel = null; $("#det").hidden = true;
  HL = matches.length ? branchOf(matches.map(m => m.id)) : null;
  if (matches.length) { matches.forEach(m => openUp(m.id)); draw(); focusOn(matches[0].id, 1); } else applyHL();
}
// ---- निर्यात / आयात ----
const PF = ["id", "name", "gender", "father_id", "mother_id", "spouse_id", "more_spouse_ids", "is_living", "birth_bs", "death_bs", "phone", "address", "notes"];
const stamp = () => new Date().toISOString().slice(0, 10);
const dl = (name, text, type) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); };
const csvq = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
const SHEET_COLS = ["id", "name", "gender", "father", "mother", "spouse", "is_living", "birth_bs", "death_bs", "phone", "address", "notes"];
const nameRef = id => { const q = byId[id]; if (!q) return ""; return people.filter(x => x.name === q.name).length > 1 ? q.id : q.name; };
function sheetRows() {
  return people.map(p => ({ id: p.id, name: p.name, gender: p.gender || "", father: nameRef(p.father_id), mother: nameRef(p.mother_id),
    spouse: spousesOf(p).map(nameRef).join("; "), is_living: p.is_living ? "हो" : "होइन",
    birth_bs: p.birth_bs || "", death_bs: p.death_bs || "", phone: p.phone || "", address: p.address || "", notes: p.notes || "" }));
}
function exportCSV() {
  const rows = sheetRows();
  dl(`vanshavali-${stamp()}.csv`, "\ufeff" + [SHEET_COLS, ...rows.map(r => SHEET_COLS.map(k => r[k]))].map(r => r.map(csvq).join(",")).join("\n"), "text/csv;charset=utf-8");
}
function exportXLSX() {
  if (!window.XLSX) return alert("Excel library लोड भएन (इन्टरनेट जाँच्नुहोस्)।");
  const ws = XLSX.utils.json_to_sheet(sheetRows(), { header: SHEET_COLS });
  const rng = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = 1; r <= rng.e.r; r++) ["birth_bs", "death_bs", "phone"].forEach(k => { const c = ws[XLSX.utils.encode_cell({ r, c: SHEET_COLS.indexOf(k) })]; if (c) { c.t = "s"; c.z = "@"; } });
  ws["!cols"] = SHEET_COLS.map(k => ({ wch: k === "id" ? 14 : (k === "notes" || k === "address") ? 28 : 16 }));
  const help = XLSX.utils.aoa_to_sheet([["निर्देशन"],
    ["१. वंशावली शीटमा सम्पादन गर्नुहोस्। पहिलो पङ्क्ति (शीर्षक) नबदल्नुहोस्।"],
    ["२. id भएको पङ्क्तिको विवरण बदलिन्छ; id खाली पङ्क्ति नयाँ व्यक्ति हुन्छ। id नबदल्नुहोस्।"],
    ["३. father / mother / spouse मा नाम लेख्नुहोस्। एकभन्दा बढी पति/पत्नी भए ; ले छुट्याउनुहोस् (जस्तै: सीता; गीता)। पहिलो नाम मुख्य जोडी हो।"],
    ["४. एउटै नाम दोहोरिएको व्यक्तिलाई जोड्न नामको सट्टा उसको id लेख्नुहोस्।"],
    ["५. gender: M (पुरुष), F (महिला), O (अन्य)। is_living: हो / होइन।"],
    ["६. मिति BS मा, जस्तै 2045-05-12। कक्षको ढाँचा Text राख्नुहोस्, नत्र Excel ले मिति बदल्न सक्छ।"],
    ["७. फाइलमा नभएका व्यक्ति हटाइँदैनन्। हटाउन साइटबाट हटाउने अनुरोध गर्नुहोस्।"],
    ["८. आयात गर्नुअघि JSON ब्याकअप लिनुहोस्।"]]);
  help["!cols"] = [{ wch: 110 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "वंशावली"); XLSX.utils.book_append_sheet(wb, help, "निर्देश");
  XLSX.writeFile(wb, `vanshavali-${stamp()}.xlsx`);
}
function svgText() {
  const F = 'font-family="Noto Sans Devanagari,sans-serif"', cut = s => esc(s.length > 20 ? s.slice(0, 19) + "…" : s);
  const body = lastLines.map(l => `<path d="${l.d}" fill="none" stroke="#8A9A9C" stroke-width="1.5"${l.m ? ' stroke-dasharray="5 4"' : ""}/>`).join("") +
    lastCards.map(({ p, x, y, d }) => `<rect x="${x}" y="${y}" width="${CW}" height="${CH}" rx="10" fill="#fff" stroke="#C5D0CC"/><rect x="${x}" y="${y}" width="${CW}" height="5" rx="2" fill="${GEN[d % GEN.length]}"/><circle cx="${x + 30}" cy="${y + CH / 2 + 2}" r="19" fill="${p.gender === "M" ? "#4A78A8" : p.gender === "F" ? "#C0587A" : "#7A8C8F"}"/><text x="${x + 30}" y="${y + CH / 2 + 8}" text-anchor="middle" font-size="18" fill="#fff" ${F}>${esc(Array.from(p.name)[0])}</text><text x="${x + 58}" y="${y + CH / 2}" font-size="14" font-weight="600" fill="#1B2A2F" ${F}>${cut(p.name)}</text><text x="${x + 58}" y="${y + CH / 2 + 18}" font-size="12" fill="#5C6C70" ${F}>${yr(p.birth_bs) || "?"}${p.is_living ? "" : " – " + (yr(p.death_bs) || "?")}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${W + 40} ${H + 40}" width="${W + 40}" height="${H + 40}"><rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="#fff"/>${body}</svg>`;
}
const exportSVG = () => dl(`vanshavali-${stamp()}.svg`, svgText(), "image/svg+xml");
function exportJPG() {
  const w = W + 40, h = H + 40, sc = Math.min(2, 8000 / Math.max(w, h)), img = new Image();
  img.onload = () => {
    const cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.scale(sc, sc); g.drawImage(img, 0, 0, w, h);
    cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `vanshavali-${stamp()}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); }, "image/jpeg", 0.92);
  };
  img.onerror = () => alert("JPG बनाउन सकिएन; SVG प्रयोग गर्नुहोस् न ल।");
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText());
}

// ---- Excel / CSV / JSON आयात ----
const GMAP = { m: "M", male: "M", "पुरुष": "M", "छोरा": "M", f: "F", female: "F", "महिला": "F", "छोरी": "F", o: "O", "अन्य": "O" };
const NO = ["false", "0", "no", "n", "होइन", "मृत", "dead"];
const UUIDRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let dateWarn = 0;
const cell = v => { if (v instanceof Date) { dateWarn++; return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`; } return String(v ?? "").trim(); };
async function importFile(f) {
  try {
    const n = f.name.toLowerCase(); let raw;
    if (n.endsWith(".json")) { raw = JSON.parse(await f.text()); if (!Array.isArray(raw)) raw = raw.people; }
    else {
      if (!window.XLSX) throw new Error("Excel library लोड भएन");
      const csv = n.endsWith(".csv"), wb = XLSX.read(csv ? (await f.text()).replace(/^\ufeff/, "") : await f.arrayBuffer(), { type: csv ? "string" : "array", cellDates: !csv, raw: csv });
      raw = XLSX.utils.sheet_to_json(wb.Sheets["वंशावली"] || wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
    }
    await importRows(raw);
  } catch (er) { alert("डाउनलोड भएन:" + (er.message || er)); }
}
async function importRows(raw) {
  dateWarn = 0;
  const rows = (raw || []).map(r => { const o = {}; Object.keys(r).forEach(k => o[k.trim().toLowerCase()] = r[k]); return o; }).filter(o => Object.values(o).some(v => cell(v)));
  if (!rows.length) throw new Error("फाइलमा कुनै पङ्क्ति भेटिएन");
  rows.forEach((o, i) => { o._row = i + 2; o._id = cell(o.id) || "new" + (i + 1); if (!cell(o.name)) throw new Error(`पङ्क्ति ${o._row}: नाम खाली छ`); });
  const ids = new Set(rows.map(o => o._id)); if (ids.size !== rows.length) throw new Error("id दोहोरिएको छ");
  const cand = {};
  rows.forEach(o => (cand[cell(o.name)] ||= []).push(o._id));
  people.filter(p => !ids.has(p.id)).forEach(p => (cand[p.name] ||= []).push(p.id));
  const ref = (v, o, what) => {
    v = cell(v); if (!v) return ""; if (ids.has(v) || UUIDRE.test(v)) return v;
    const m = cand[v];
    if (!m) throw new Error(`पङ्क्ति ${o._row}: ${what} "${v}" भेटिएन`);
    if (m.length > 1) throw new Error(`पङ्क्ति ${o._row}: ${what} "${v}" नाम दोहोरिएको छ — नामको सट्टा id लेख्नुहोस्`);
    return m[0];
  };
  const out = rows.map(o => {
    const sps = [...cell(o.spouse || o.spouse_id).split(/\s*[;|；]\s*/), ...(Array.isArray(o.more_spouse_ids) ? o.more_spouse_ids : [])].filter(Boolean).map(s => ref(s, o, "पति/पत्नी"));
    const g = cell(o.gender);
    return { id: o._id, name: cell(o.name), gender: GMAP[g.toLowerCase()] || (["M", "F", "O"].includes(g) ? g : ""),
      father_id: ref(o.father || o.father_id, o, "बुबा"), mother_id: ref(o.mother || o.mother_id, o, "आमा"),
      spouse_id: sps[0] || "", more_spouse_ids: sps.slice(1), is_living: !NO.includes(cell(o.is_living).toLowerCase()),
      birth_bs: cell(o.birth_bs), death_bs: cell(o.death_bs), phone: cell(o.phone), address: cell(o.address), notes: cell(o.notes) };
  });
  const upd = out.filter(o => byId[o.id]).length, kept = people.filter(p => !ids.has(p.id)).length;
  if (!confirm(`${upd} व्यक्तिको विवरण बदलिन्छ, ${out.length - upd} नयाँ थपिन्छन्।${kept ? `\nफाइलमा नभएका ${kept} व्यक्ति जस्ताको तस्तै रहन्छन्।` : ""}${dateWarn ? `\n⚠ ${dateWarn} मिति Excel ले मितिमा बदलेको देखियो; जाँच्नुहोस्।` : ""}\nजारी राख्ने?`)) return;
  const { data, error } = await db.rpc("import_people", { payload: out });
  if (error) throw error;
  alert(`${data} व्यक्ति डाउनलोड भयो।`); await load(); render();
}

// ---------- अर्को पति/पत्नी ----------
function spouseForm(p) {
  const d = $("#dlg");
  d.innerHTML = `<h3>"${esc(p.name)}" को अर्को पति/पत्नी</h3>
    <label>सूचीबाट छान्नुहोस्<select id="sp_id">${opts("")}</select></label>
    <label>वा नयाँ नाम लेख्नुहोस्<input id="sp_name" placeholder="सूचीमा छैन भने"></label>
    <p class="mut">सन्तान थप्दा "अर्को अभिभावक" मा सम्बन्धित पत्नी/पति छान्नुहोस्, सन्तान आ-आफ्नी आमाको मुनि देखिन्छन्।</p>
    <label>एडमिनलाई सन्देश<textarea id="nt" rows="2"></textarea></label><div class="msg" id="fm"></div>
    <div class="row"><button id="go">अनुरोध पठाउने</button><button class="ghost" id="cx">रद्द</button></div>`;
  d.showModal(); $("#cx").onclick = () => d.close();
  const s = $("#sp_id"), t = $("#sp_name");
  s.onchange = () => { t.disabled = !!s.value; if (s.value) t.value = ""; };
  $("#go").onclick = () => {
    const pl = {};
    if (s.value) { if (s.value === p.id) return $("#fm").textContent = "आफैंलाई छान्न मिल्दैन।"; pl.add_spouse_id = s.value; }
    else if (t.value.trim()) pl.add_spouse_name = t.value.trim();
    else return $("#fm").textContent = "सूचीबाट छान्नुहोस् वा नाम लेख्नुहोस्।";
    send("update", p.id, pl, d);
  };
}
const XL = { add_spouse_id: "अर्को पति/पत्नी", add_spouse_name: "अर्को पति/पत्नी (नयाँ नाम)" };

function treeView() {
  sel = null; HL = null; matches = [];
  $("#pane").innerHTML = `<div class="chartwrap" id="cw">
    <div class="tools"><input id="q" placeholder="🔍 नाम खोज्नुहोस् (Enter = अर्को)…" aria-label="खोज"><span id="qc" class="mut"></span>
      <button class="ghost" id="zo" aria-label="सानो">−</button><input id="zr" type="range" min="2" max="250" aria-label="जुम"><button class="ghost" id="zi" aria-label="ठूलो">+</button>
      <button class="ghost" id="fit" title="पूरै रूख देखाउने">पूरै रुख हेर्ने</button><button class="ghost" id="ea" title="सबै शाखा खोल्ने">सबै शाखा खोल्ने</button><button class="ghost" id="ca" title="शाखा बन्द गर्ने">संक्षिप्त</button>
      <details class="menu"><summary>${me.role === "admin" ? "⇩ डाउनलोड" : "⇩ बंशावली डाउनलोड"}</summary><div>${me.role === "admin" ? `<button class="ghost" id="xe">📊 Excel (.xlsx)</button><button class="ghost" id="xc">📄 CSV</button><button class="ghost" id="xj">💾 JSON (ब्याकअप)</button>` : ""}<button class="ghost" id="xs">🖼 फोटो (HD) (SVG)</button><button class="ghost" id="xp">📷 फोटो (SD) (JPG)</button>${me.role === "admin" ? `<button class="ghost" id="xi">📥 अपलोड गर्नुहोस्</button><input type="file" id="xf" accept=".xlsx,.xls,.csv,.json" hidden>` : ""}</div></details>
      <button class="ghost" id="fs" aria-label="पूरा स्क्रिन">⛶</button></div>
    <div id="chart"><div id="stage"></div>${people.length ? "" : `<div class="empty"><p>अझै कोही थपिएको छैन।</p><button id="first">पहिलो व्यक्ति थप्ने अनुरोध</button></div>`}</div>
    <aside class="card" id="det" hidden></aside></div>`;
  if ($("#first")) $("#first").onclick = () => form("add");
  draw(); home();
  const ch = $("#chart"), ptrs = new Map(); let drag = null, moved = false, pd = 0;
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  ch.onpointerdown = e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; drag = ptrs.size === 1 ? { x: e.clientX, y: e.clientY, vx: V.x, vy: V.y } : null; if (ptrs.size === 2) pd = dist(); };
  window.onpointermove = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const d = dist(), [a, b] = [...ptrs.values()], r = ch.getBoundingClientRect(); if (pd) zoomAt(d / pd, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pd = d; moved = true; return; }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    V.x = drag.vx + dx; V.y = drag.vy + dy; applyV();
  };
  window.onpointerup = window.onpointercancel = e => { ptrs.delete(e.pointerId); drag = null; pd = 0; };
  ch.onclick = e => {
    if (moved) return;
    const tg = e.target.closest(".tg");
    if (tg) { const k = tg.dataset.t; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); draw(); return; }
    const t = e.target.closest("[data-id]"); if (t) pick(t.dataset.id); else unpick();
  };
  ch.onkeydown = e => { if (e.key === "Enter" && e.target.dataset.id) pick(e.target.dataset.id); };
  ch.onwheel = e => { e.preventDefault(); const r = ch.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top); };
  const mid = f => zoomAt(f, ch.clientWidth / 2, ch.clientHeight / 2);
  $("#zi").onclick = () => mid(1.2); $("#zo").onclick = () => mid(0.83); $("#fit").onclick = fit;
  $("#zr").oninput = e => mid(e.target.value / 100 / V.k);
  $("#ea").onclick = () => { collapsed.clear(); draw(); fit(); };
  $("#ca").onclick = () => { const f = n => { if (n.d >= 1 && n.all.length) collapsed.add(n.p.id); n.all.forEach(f); }; lastTrees.forEach(f); draw(); home(); };
  $("#q").oninput = e => search(e.target.value);
  $("#q").onkeydown = e => { if (e.key === "Enter") search($("#q").value, true); };
  $("#fs").onclick = () => document.fullscreenElement ? document.exitFullscreen() : $("#cw").requestFullscreen?.();
  document.onfullscreenchange = () => setTimeout(fit, 120);
  window.onkeydown = e => { if (e.key === "Escape") unpick(); };
  $(".menu div").addEventListener("click", () => { $(".menu").open = false; });
  const on = (id, f) => { const el = $(id); if (el) el.onclick = f; };
  on("#xj", () => dl(`vanshavali-${stamp()}.json`, JSON.stringify(people.map(p => Object.fromEntries(PF.map(k => [k, p[k] ?? null]))), null, 1), "application/json"));
  on("#xc", exportCSV); on("#xe", exportXLSX); on("#xs", exportSVG); on("#xp", exportJPG);
  if ($("#xi")) { $("#xi").onclick = () => $("#xf").click(); $("#xf").onchange = e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ""; }; }
}

function detail() {
  const p = byId[sel]; if (!p) return;
  const rel = id => id && byId[id] ? esc(byId[id].name) : "—";
  const cs = kids(p).map(k => esc(k.name)).join(", ") || "—";
  $("#det").hidden = false;
  $("#det").innerHTML = `<div class="dhead"><h3>${esc(p.name)}</h3><button class="ghost" id="dx" aria-label="बन्द">×</button></div>
    <p>बुबा: ${rel(p.father_id)}<br>आमा: ${rel(p.mother_id)}<br>पति/पत्नी: ${spousesOf(p).map(i => esc(byId[i].name)).join(", ") || "—"}<br>सन्तान: ${cs}</p>
    <p>जन्म: ${esc(p.birth_bs) || "—"}${p.is_living ? "" : `<br>मृत्यु: ${esc(p.death_bs) || "—"}`}<br>फोन: ${esc(p.phone) || "—"}<br>ठेगाना: ${esc(p.address) || "—"}</p>
    ${p.notes ? `<p>${esc(p.notes)}</p>` : ""}
    <div class="row"><button id="ed">सच्याउने अनुरोध</button><button class="ghost" id="ac">सन्तान थप्ने</button><button class="ghost" id="as">+ पति/पत्नी</button><button class="bad" id="dl">हटाउने अनुरोध</button></div>`;
  $("#ed").onclick = () => form("update", p);
  $("#ac").onclick = () => kidsForm(p);
  $("#as").onclick = () => spouseForm(p);
  $("#dl").onclick = () => form("delete", p);
  $("#dx").onclick = unpick;
}

// ---------- अनुरोध फारम ----------
const opts = (cur) => `<option value="">— छैन —</option>` + people.map(p => `<option value="${p.id}" ${p.id===cur?"selected":""}>${esc(p.name)}</option>`).join("");
const pSel = (k, lab, v) => `<label>${lab}<select id="f_${k}_id">${opts(v[k + "_id"])}</select><input id="f_${k}_name" placeholder="सूचीमा छैन भने नयाँ नाम लेख्नुहोस्" style="margin-top:.3rem"></label>`;
function form(action, p = null, parent = null) {
  const d = $("#dlg");
  if (action === "delete") {
    d.innerHTML = `<h3>"${esc(p.name)}" हटाउन अनुरोध</h3><label>कारण<textarea id="nt" rows="3"></textarea></label>
      <div class="msg" id="fm"></div><div class="row"><button id="go" class="bad">अनुरोध पठाउने</button><button class="ghost" id="cx">रद्द</button></div>`;
    d.showModal(); $("#cx").onclick = () => d.close();
    $("#go").onclick = () => send("delete", p.id, {}, d);
    return;
  }
  const v = p ? { ...p } : { is_living: true };
  if (parent) {
    const sp = parent.spouse_id;
    if (parent.gender === "F") { v.mother_id = parent.id; v.father_id = sp || ""; } else { v.father_id = parent.id; v.mother_id = sp || ""; }
  }
  d.innerHTML = `<h3>${action === "add" ? "नयाँ व्यक्ति थप्ने अनुरोध" : `"${esc(p.name)}" सच्याउने अनुरोध`}</h3>
    <div class="grid">
    <label>नाम *<input id="f_name" value="${esc(v.name)}"></label>
    <label>लिङ्ग<select id="f_gender"><option value="">—</option>${["M:पुरुष","F:महिला","O:अन्य"].map(x => { const [k,l]=x.split(":"); return `<option value="${k}" ${v.gender===k?"selected":""}>${l}</option>`; }).join("")}</select></label>
    ${pSel("father", "बुबा", v)}
    ${pSel("mother", "आमा", v)}
    ${pSel("spouse", "पति/पत्नी", v)}
    <label>जीवित?<select id="f_is_living"><option value="true" ${v.is_living?"selected":""}>हो</option><option value="false" ${v.is_living?"":"selected"}>होइन</option></select></label>
    <label>जन्म मिति (BS) २०४५-०५-१२<input id="f_birth_bs" value="${esc(v.birth_bs)}"></label>
    <label>मृत्यु मिति (BS)<input id="f_death_bs" value="${esc(v.death_bs)}"></label>
    <label>फोन<input id="f_phone" value="${esc(v.phone)}"></label>
    <label>ठेगाना<input id="f_address" value="${esc(v.address)}"></label></div>
    <label>टिप्पणी<textarea id="f_notes" rows="2">${esc(v.notes)}</textarea></label>
    <label>एडमिनलाई सन्देश (स्रोत/प्रमाण)<textarea id="nt" rows="2"></textarea></label>
    <div class="msg" id="fm"></div>
    <div class="row"><button id="go">अनुरोध पठाउने</button><button class="ghost" id="cx">रद्द</button></div>`;
  d.showModal(); $("#cx").onclick = () => d.close();
  ["father", "mother", "spouse"].forEach(k => {
    const s = $("#f_" + k + "_id"), t = $("#f_" + k + "_name");
    const sync = () => { t.disabled = !!s.value; if (s.value) t.value = ""; };
    s.onchange = sync; sync();
  });
  $("#go").onclick = () => {
    const cur = {};
    FIELDS.forEach(k => { let x = $("#f_" + k).value.trim(); if (k === "is_living") x = x === "true"; cur[k] = x; });
    if (!cur.name) return $("#fm").textContent = "नाम अनिवार्य छ।";
    let payload = cur;
    if (action === "update") {
      payload = {};
      FIELDS.forEach(k => { const old = p[k] ?? (k === "is_living" ? true : ""); if (String(cur[k]) !== String(old)) payload[k] = cur[k]; });
      if (!Object.keys(payload).length) return $("#fm").textContent = "कुनै परिवर्तन गरिएको छैन।";
    }
    send(action, p?.id ?? null, payload, d);
  };
}
async function send(action, person_id, payload, d) {
  const { error } = await db.from("change_requests").insert({ requested_by: me.id, action, person_id, payload, note: $("#nt")?.value || null });
  if (error) return $("#fm").textContent = error.message;
  d.close(); alert("अनुरोध पठाइयो। एडमिनको स्वीकृतिपछि वंशावलीमा देखिनेछ।");
}

// ---------- एकै विन्डोमा धेरै सन्तान ----------
function kidsForm(parent) {
  const d = $("#dlg");
  const row = () => `<div class="krow"><input class="k-name" placeholder="नाम" aria-label="नाम"><select class="k-g" aria-label="लिङ्ग"><option value="M">छोरा</option><option value="F">छोरी</option><option value="">—</option></select><input class="k-b" placeholder="जन्म BS" aria-label="जन्म मिति"><select class="k-l" aria-label="जीवित"><option value="true">जीवित</option><option value="false">दिवंगत</option></select><button type="button" class="bad k-x" aria-label="हटाउने">×</button></div>`;
  d.innerHTML = `<h3>"${esc(parent.name)}" का सन्तान थप्ने</h3>
    <label>अर्को अभिभावक (${parent.gender === "F" ? "बुबा" : "आमा"}) — सूचीमा नभए पहिले उनको विवरण थप्नुहोस्<select id="k-other">${opts(parent.spouse_id)}</select></label>
    <div id="krows">${row()}${row()}</div>
    <div class="row"><button type="button" class="ghost" id="k-add">+ अर्को सन्तान</button></div>
    <label>एडमिनलाई सन्देश<textarea id="nt" rows="2"></textarea></label>
    <div class="msg" id="fm"></div><div class="row"><button id="go">अनुरोध पठाउने</button><button class="ghost" id="cx">रद्द</button></div>`;
  d.showModal(); $("#cx").onclick = () => d.close();
  $("#k-add").onclick = () => $("#krows").insertAdjacentHTML("beforeend", row());
  $("#krows").onclick = e => { const x = e.target.closest(".k-x"); if (x && document.querySelectorAll(".krow").length > 1) x.closest(".krow").remove(); };
  $("#go").onclick = async () => {
    const other = $("#k-other").value, batch = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    const kids = [...document.querySelectorAll(".krow")].map(r => ({ name: r.querySelector(".k-name").value.trim(), gender: r.querySelector(".k-g").value, birth_bs: r.querySelector(".k-b").value.trim(), is_living: r.querySelector(".k-l").value === "true" })).filter(r => r.name);
    if (!kids.length) return $("#fm").textContent = "कम्तिमा एउटा नाम लेख्नुहोस्।";
    const par = parent.gender === "F" ? { mother_id: parent.id, father_id: other } : { father_id: parent.id, mother_id: other };
    const reqs = kids.map(k => ({ requested_by: me.id, action: "add", person_id: null, note: $("#nt").value || null, payload: { ...k, ...par, batch } }));
    const { error } = await db.from("change_requests").insert(reqs);
    if (error) return $("#fm").textContent = error.message;
    d.close(); alert(`${reqs.length} सन्तानको अनुरोध पठाइयो।`);
  };
}

// ---------- अनुरोध विवरण ----------
const STATUS = { pending: "पर्खाइमा", approved: "स्वीकृत", rejected: "अस्वीकृत" };
const ACT = { add: "थप्ने", update: "सच्याउने", delete: "हटाउने" };
function desc(r) {
  const who = r.person_id && byId[r.person_id] ? ` — ${esc(byId[r.person_id].name)}` : "";
  const lines = Object.entries(r.payload || {}).filter(([k]) => k !== "batch").map(([k, v]) => {
    const val = k.endsWith("_id") ? (byId[v]?.name || "—") : v === true ? "हो" : v === false ? "होइन" : v || "—";
    return `${LABEL[k] || XL[k] || k}: ${esc(val)}`;
  }).join("<br>");
  return `<b>${ACT[r.action]}</b>${who}<br>${lines}${r.note ? `<br><span class="mut">सन्देश: ${esc(r.note)}</span>` : ""}`;
}
async function mineView() {
  const { data } = await db.from("change_requests").select("*").eq("requested_by", me.id).order("created_at", { ascending: false });
  $("#pane").innerHTML = (data?.length ? data : []).map(r => `<div class="card">${desc(r)}<p class="mut">स्थिति: ${STATUS[r.status]}${r.reject_reason ? ` (${esc(r.reject_reason)})` : ""}</p></div>`).join("") || `<div class="card">अझै कुनै अनुरोध छैन।</div>`;
}

// ---------- एडमिन ----------
async function adminView() {
  const REQ = "*, profiles!change_requests_requested_by_fkey(full_name,email)";
  const [{ data: reqs }, { data: pend }, { data: mem }, { data: hist }] = await Promise.all([
    db.from("change_requests").select(REQ).eq("status", "pending").order("created_at"),
    db.from("profiles").select("*").eq("role", "pending"),
    db.from("profiles").select("*").neq("role", "pending").order("full_name"),
    db.from("change_requests").select(REQ).neq("status", "pending").order("created_at", { ascending: false }).limit(200)
  ]);
  const groups = [];
  (reqs || []).forEach(r => { const b = r.payload?.batch; let g = b && groups.find(x => x.batch === b); if (!g) { g = { batch: b, items: [] }; groups.push(g); } g.items.push(r); });
  const okIds = (hist || []).filter(r => r.status === "approved").map(r => r.id);
  $("#pane").innerHTML = `<h2>नयाँ सदस्य (${pend?.length || 0})</h2>` +
    (pend || []).map(u => `<div class="card">${esc(u.full_name)} · ${esc(u.email)}<div class="row"><button data-u="${u.id}" data-r="member">सदस्य बनाउने</button></div></div>`).join("") +
    `<h2>सदस्यहरू (${mem?.length || 0})</h2><div class="card">${(mem || []).map(u => `<div class="mrow"><span class="mav">${esc(Array.from(u.full_name || u.email || "?")[0])}</span><div><b>${esc(u.full_name || "—")}</b><br><span class="mut">${esc(u.email)}</span></div><span class="tag">${esc(u.role)}</span></div>`).join("") || "कोही छैन।"}</div>` +
    `<h2>परिवर्तन अनुरोध (${groups.length})</h2>` +
    groups.map(g => { const ids = g.items.map(r => r.id).join(","), r0 = g.items[0]; return `<div class="card">${g.items.length > 1 ? `<b>${g.items.length} सन्तान एकैसाथ</b><hr>` : ""}${g.items.map(desc).join("<hr>")}
      <p class="mut">अनुरोधकर्ता: ${esc(r0.profiles?.full_name || r0.profiles?.email)}</p>
      <div class="row"><button data-a="${ids}">${g.items.length > 1 ? "सबै स्वीकृत" : "स्वीकृत"}</button><button class="bad" data-x="${ids}">${g.items.length > 1 ? "सबै अस्वीकार" : "अस्वीकार"}</button></div></div>`; }).join("") +
    `<h2>अनुरोध इतिहास (${hist?.length || 0})</h2>` +
    (okIds.length ? `<div class="row" style="margin-bottom:.8rem"><button class="bad" data-d="${okIds.join(",")}">सबै स्वीकृत इतिहास मेट्ने (${okIds.length})</button></div>` : "") +
    (hist || []).map(r => `<div class="card">${desc(r)}<p class="mut">स्थिति: ${STATUS[r.status]}${r.reject_reason ? ` (${esc(r.reject_reason)})` : ""} · अनुरोधकर्ता: ${esc(r.profiles?.full_name || r.profiles?.email)}</p><div class="row"><button class="bad" data-d="${r.id}">मेट्ने</button></div></div>`).join("");
  $("#pane").onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    let err;
    if (b.dataset.d) {
      const ids = b.dataset.d.split(",");
      if (!confirm(`${ids.length} अनुरोध स्थायी रूपमा मेट्ने?`)) return;
      const { data, error } = await db.from("change_requests").delete().in("id", ids).select("id");
      if (error) return alert(error.message);
      if (!data?.length) return alert("मेटिएन — Supabase मा एडमिनलाई change_requests delete गर्ने अनुमति (RLS policy) चाहिन्छ।");
    }
    if (b.dataset.u) ({ error: err } = await db.rpc("set_member_role", { target: b.dataset.u, new_role: "member" }));
    if (b.dataset.a) for (const id of b.dataset.a.split(",")) { ({ error: err } = await db.rpc("review_request", { req: id, approve: true })); if (err) break; }
    if (b.dataset.x) { const reason = prompt("अस्वीकार गर्ने कारण?"); if (reason === null) return; for (const id of b.dataset.x.split(",")) { ({ error: err } = await db.rpc("review_request", { req: id, approve: false, reason })); if (err) break; } }
    if (err) return alert(err.message);
    await load(); render();
  };
}
document.addEventListener("pointerdown", e => { const m = document.querySelector("details.menu[open]"); if (m && !m.contains(e.target)) m.open = false; });
document.addEventListener("keydown", e => { if (e.key === "Escape") { const m = document.querySelector("details.menu[open]"); if (m) m.open = false; } });
boot();
