const CACHE = "pdl-v2";
const ROOT = new URL("./", self.registration.scope).href;
const FILES = ["manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"].map(f => ROOT + f).concat([ROOT]);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(u => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const okRes = r => r && (r.ok || r.status === 0) && r.status !== 206;
const tell = async () => { const cl = await self.clients.matchAll(); cl.forEach(c => c.postMessage({ type: "upd" })); };

async function staleWhileRevalidate(e, req, key) {
  const c = await caches.open(CACHE);
  const old = await c.match(key);
  const net = fetch(req).then(async r => {
    if (okRes(r)) {
      const o = old && (old.headers.get("etag") || old.headers.get("last-modified"));
      const n = r.headers.get("etag") || r.headers.get("last-modified");
      await c.put(key, r.clone());
      if (old && o && n && o !== n && key === ROOT) tell();
    }
    return r;
  }).catch(() => null);
  e.waitUntil(net);
  return old || (await net) || (await c.match(ROOT)) || Response.error();
}

async function networkFirst(req, key) {
  try {
    const r = await fetch(req);
    if (okRes(r)) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); }
    return r;
  } catch (err) {
    const c = await caches.open(CACHE);
    return (await c.match(key)) || (await c.match(ROOT)) || Response.error();
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (okRes(r)) c.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    const key = req.mode === "navigate" ? ROOT : req;
    const fresh = req.cache === "reload" || req.cache === "no-cache";
    e.respondWith(fresh ? networkFirst(req, key) : staleWhileRevalidate(e, req, key));
    return;
  }
  if (["script", "style", "font"].includes(req.destination)) {
    e.respondWith(cacheFirst(req).catch(() => fetch(req)));
  }
});
