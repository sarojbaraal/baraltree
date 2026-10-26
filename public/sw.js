// Offline shell for the Vansavali PWA. Data (Supabase) and API calls always go to the network.
const V = "vansh-next-2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())
  );
});
// the page tells us which files it loaded so the whole app is available offline after the first visit
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "cache" || !Array.isArray(d.urls)) return;
  e.waitUntil(
    caches.open(V).then((ch) =>
      Promise.all(d.urls.map((u) => { try { const x = new URL(u, location.origin); return x.origin === location.origin ? ch.add(x.href).catch(() => {}) : null; } catch { return null; } }))
    )
  );
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.pathname.startsWith("/api/")) return;
  if (u.hostname.endsWith("supabase.co")) {
    // profile photos / site avatars: keep a copy so faces still show offline; data calls always go to the network
    if (!u.pathname.startsWith("/storage/v1/object/public/")) return;
    e.respondWith(
      caches.match(r).then((m) => {
        const n = fetch(r).then((res) => { if (res.ok || res.type === "opaque") { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); } return res; }).catch(() => m);
        return m || n;
      })
    );
    return;
  }
  const ok = u.origin === location.origin || /(jsdelivr|cdnjs|googleapis|gstatic)/.test(u.hostname);
  if (!ok) return;
  if (r.mode === "navigate") {
    // network first, cached copy when offline
    e.respondWith(
      fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match("/")))
    );
    return;
  }
  if (u.origin === location.origin && !u.pathname.startsWith("/_next/static/") && !/\.(png|jpe?g|svg|webp|ico|woff2?|json)$/.test(u.pathname)) {
    // other same-origin data (page payloads): network first so a new release is never hidden by an old copy
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); } return res; }).catch(() => caches.match(r)));
    return;
  }
  // hashed build assets, fonts, icons: cache first, refresh in background
  e.respondWith(
    caches.match(r).then((m) => {
      const n = fetch(r).then((res) => { if (res.ok) { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); } return res; }).catch(() => m);
      return m || n;
    })
  );
});
