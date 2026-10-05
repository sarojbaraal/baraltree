const V = "vansh-v19", SHELL = ["./", "./index.html", "./app.js", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.hostname.endsWith("supabase.co")) return; // लगइन/डेटा सधैं नेटवर्कबाट
  const ok = u.origin === location.origin || /(jsdelivr|cdnjs|googleapis|gstatic)/.test(u.hostname);
  if (!ok) return;
  if (r.mode === "navigate" || u.pathname.endsWith("app.js")) { // नेटवर्क पहिले, अफलाइन भए cache
    e.respondWith(fetch(r).then(res => { caches.open(V).then(c => c.put(r, res.clone())); return res; }).catch(() => caches.match(r).then(m => m || caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => { const n = fetch(r).then(res => { if (res.ok) caches.open(V).then(c => c.put(r, res.clone())); return res; }).catch(() => m); return m || n; }));
});
