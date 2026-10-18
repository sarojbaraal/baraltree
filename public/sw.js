// Offline shell for the Vansavali PWA. Data (Supabase) and API calls always go to the network.
const V = "vansh-next-1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.hostname.endsWith("supabase.co") || u.pathname.startsWith("/api/")) return;
  const ok = u.origin === location.origin || /(jsdelivr|cdnjs|googleapis|gstatic)/.test(u.hostname);
  if (!ok) return;
  if (r.mode === "navigate") {
    // network first, cached copy when offline
    e.respondWith(
      fetch(r).then((res) => { const c = res.clone(); caches.open(V).then((ch) => ch.put(r, c)); return res; }).catch(() => caches.match(r))
    );
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
