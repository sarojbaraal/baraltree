// create-user: an admin creates a sign-in account (email + temporary password) and sets roles and position.
// The new person must change the password on first login (user_metadata.must_change_password).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["general", "premium", "moderator", "admin"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST मात्र" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "सर्भर सेटअप अधुरो छ।" }, 500);

    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "लगइन आवश्यक छ।" }, 401);
    const db = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: au, error: ae } = await db.auth.getUser(token);
    if (ae || !au.user) return json({ error: "सेसन अमान्य वा सकिएको छ।" }, 401);
    const { data: me } = await db.from("profiles").select("role, roles, suspended_at").eq("id", au.user.id).maybeSingle();
    const isAdmin = !me?.suspended_at && (me?.role === "admin" || (Array.isArray(me?.roles) && me.roles.includes("admin")));
    if (!isAdmin) return json({ error: "यो काम एडमिनले मात्र गर्न सक्छ।" }, 403);

    const b = await req.json().catch(() => ({}));
    const full_name = String(b.full_name || "").trim();
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const roles: string[] = Array.isArray(b.roles) ? b.roles.map(String) : [];
    const pos = b.position_person_id ? String(b.position_person_id) : null;
    if (!full_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "नाम र सही इमेल चाहिन्छ।" }, 400);
    if (password.length < 8) return json({ error: "पासवर्ड कम्तिमा ८ अक्षरको हुनुपर्छ।" }, 400);
    if (!roles.length || !roles.every((r) => ROLES.includes(r))) return json({ error: "भूमिका अमान्य छ।" }, 400);
    if (pos && !UUID.test(pos)) return json({ error: "स्थान अमान्य छ।" }, 400);

    const { data: created, error: ce } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, must_change_password: true },
    });
    if (ce || !created.user) {
      const m = ce?.message || "";
      return json({ error: /already|registered|exists/i.test(m) ? "यो इमेलबाट खाता पहिले नै बनेको छ।" : "खाता बन्न सकेन: " + m }, 400);
    }
    const id = created.user.id;
    // the sign-up trigger has created a pending profile; give it its roles and position
    const upd = { roles, role: roles.includes("admin") ? "admin" : "member", position_person_id: pos, full_name, email };
    let { error: pe } = await db.from("profiles").update(upd).eq("id", id);
    if (pe) {
      // trigger not finished or row missing: create it
      ({ error: pe } = await db.from("profiles").upsert({ id, ...upd }));
    }
    if (pe) {
      await db.auth.admin.deleteUser(id);
      return json({ error: "प्रोफाइल बनाउन सकिएन: " + pe.message }, 500);
    }
    return json({ ok: true, id });
  } catch (e) {
    console.error("create-user", (e as Error).message);
    return json({ error: "अप्रत्याशित त्रुटि।" }, 500);
  }
});
