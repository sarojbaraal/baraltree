// ====== यहाँ आफ्नो Supabase को Project URL र anon public key राख्नुहोस् ======
const CFG = { url: "https://onhznyefbseptuwurqxx.supabase.co", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uaHpueWVmYnNlcHR1d3VycXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NTM5NDUsImV4cCI6MjEwNjMyOTk0NX0.4o8tWadbJZ29uXaW7Gbn_2IinDLVtsda757kz-be1z0" };
const db = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LABEL = {name: "नाम ",gender: "लिङ्ग ",father_id: "बुबा ",mother_id: "आमा ",spouse_id: "पति/पत्नी ",father_name: "बुबा (नयाँ नाम) ",mother_name: "आमा (नयाँ नाम) ",spouse_name: "पति/पत्नी (नयाँ नाम) ",is_living: "जीवित ",birth_bs: "जन्म मिति (BS) ",death_bs: "मृत्यु मिति (BS) ",phone: "फोन ",address: "ठेगाना ",notes: "टिप्पणी ",maiden_name: "विवाहअघिको थर (Maiden) ",married_name: "विवाहपछिको थर (Married) ",birth_place: "जन्म स्थान ", photo_url: "प्रोफाइल फोटो "};
const FIELDS = Object.keys(LABEL);
const APP_VER = "V1108_09Oct";
let qText = { tree: "", fam: "" }, keepView = null;
const setVer = () => { const v = $("#ver"); if (!v) return; const ix = document.querySelector('meta[name=index-version]')?.content || "?"; v.dataset.t = isAdm() ? `Index: ${ix}\nApp: ${APP_VER}` : APP_VER; };
async function reloadKeep() {
  const k = { sel, y: scrollY, V: tab === "tree" ? { ...V } : null };
  await load(); keepView = k.V ? k : null; render();
  if (k.sel && byId[k.sel] && tab !== "admin") pick(k.sel);
  scrollTo(0, k.y);
}
let me = null, people = [], byId = {}, sel = null, tab = "fam";

const invTok = () => { try { return localStorage.getItem("vv_invite"); } catch (e) { return null; } };
{ const t = new URLSearchParams(location.search).get("invite"); if (t) { try { localStorage.setItem("vv_invite", t); } catch (e) {} history.replaceState(null, "", location.pathname); } }
let recovering = false;
db.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") recovering = true; setTimeout(boot, 0); });
const ROLE_L = { general: "सामान्य सदस्य", premium: "प्रिमियम सदस्य", moderator: "मोडरेटर", admin: "एडमिन" }, ORDER = ["admin", "moderator", "premium", "general"];
let act = null, ACC = null;
const myRoles = () => { const r = new Set(me?.roles || []); if (me?.role === "admin") ORDER.forEach(x => r.add(x)); else if (me?.role === "member" && !r.size) r.add("general"); return ORDER.filter(x => r.has(x)); };
const isAdm = () => act === "admin", isStaff = () => act === "admin" || act === "moderator", seesAll = () => act !== "general";
const can = id => !ACC || ACC.has(id), nm = p => can(p.id) ? p.name : "••••••";
const np = n => String(n).replace(/\d/g, d => "०१२३४५६७८९"[d]);
const na = s => String(s ?? "").replace(/[०-९]/g, d => "०१२३४५६७८९".indexOf(d));
const ico = g => `<svg aria-hidden="true"><use href="#${g === "F" ? "avF" : "avM"}" width="100%" height="100%"/></svg>`;
const DM = {"क":"k","ख":"k","ग":"g","घ":"g","ङ":"n","च":"c","छ":"c","ज":"j","झ":"j","ञ":"n","ट":"t","ठ":"t","ड":"d","ढ":"d","ण":"n","त":"t","थ":"t","द":"d","ध":"d","न":"n","प":"p","फ":"p","ब":"b","भ":"b","म":"m","य":"y","र":"r","ल":"l","व":"b","श":"s","ष":"s","स":"s","ह":"h","ऋ":"r","ृ":"r","ळ":"l"};
const skel = s => { s = String(s || "").toLowerCase().replace(/ज्ञ/g, "gy"); let o = ""; for (const ch of s) o += DM[ch] ?? (/[a-z]/.test(ch) ? ch : "");
  return o.replace(/chh|ch/g, "c").replace(/([kgjtdpb])h/g, "$1").replace(/sh/g, "s").replace(/x/g, "ks").replace(/f/g, "p").replace(/[vw]/g, "b").replace(/z/g, "j").replace(/q/g, "k").replace(/[aeiou]/g, ""); };
const match = (t, q) => { t = String(t || "").toLowerCase(); if (t.includes(q)) return true; if (!/[a-z]/.test(q)) return false; const k = skel(q); return !!k && skel(t).includes(k); };
function toast(m) { let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); } t.textContent = m; t.className = "show"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2800); }
function daughterLocked() {
  const L = new Set(), add = id => { if (!id || L.has(id) || !byId[id]) return; L.add(id); spousesOf(byId[id]).forEach(add); kidsOf(byId[id]).forEach(c => add(c.id)); };
  people.filter(p => p.gender === "F" && hasParents(p) && spousesOf(p).length).forEach(p => { spousesOf(p).forEach(add); kidsOf(p).forEach(c => add(c.id)); });
  return L;
}
const hasClaim = u => !!(u?.claim_father || u?.claim_grand);
const hasPos = u => !!(u?.position_person_id || u?.position_parent_id || u?.position_grand_id);
const myPos = () => me?.position_person_id || me?.position_parent_id || me?.position_grand_id || null;
const dispName = () => byId[me?.position_person_id]?.name || me?.full_name || me?.email || "";
function ownSet() {
  const own = new Set(), base = byId[me.position_person_id] || byId[me.position_parent_id] || byId[me.position_grand_id]; if (!base) return own;
  const sib = x => people.filter(y => y.id !== x.id && ((x.father_id && y.father_id === x.father_id) || (x.mother_id && y.mother_id === x.mother_id)));
  const all = ids => branchOf(ids).forEach(i => own.add(i));
  all([base.id]); if (byId[me.position_person_id]) sib(base).forEach(y => all([y.id]));
  return own;
}
function premiumRoot() {
  const m = byId[me.position_person_id], pa = byId[me.position_parent_id], gr = byId[me.position_grand_id];
  const f = m ? byId[m.father_id] : pa ? (pa.gender === "F" ? byId[pa.spouse_id] : pa) : null;
  const gf = gr || byId[f?.father_id] || f;
  return byId[gf?.father_id] || gf ||