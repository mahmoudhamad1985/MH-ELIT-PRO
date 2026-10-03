/* MH ELITE PRO — service worker (2026-10-03)
   Pages (HTML) are CACHE-FIRST: the app opens instantly from the copy saved on the phone, even with no internet.
   In the background the latest version is downloaded; if it differs, the open app is told so it can show
   "✨ New update — tap to refresh". Other same-origin files (icons, manifest, coach videos) are cache-first too. */
const CACHE = 'mh-elite-pro-2026-10-03';
const CORE = ['./', 'MH-ELITE-PRO.html', 'manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(CORE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'MH_CHECK_UPDATE' && d.url) event.waitUntil(refresh(d.url, event.source && event.source.id));
});

function isPage(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && (accept.includes('text/html') || /\.html?(\?|$)/i.test(new URL(request.url).pathname));
}

/* one cache entry per page, without ?code=… or #… */
function pageKey(u) { const x = new URL(u); x.search = ''; x.hash = ''; return x.href; }

/* download the newest copy; if it differs from the saved one, store it and tell the open app */
const busy = {};
async function refresh(url, clientId) {
  const key = pageKey(url);
  if (busy[key]) return busy[key];
  busy[key] = (async () => {
    try {
      const res = await fetch(key, { cache: 'no-store' });
      if (!res || !res.ok) return;
      const cache = await caches.open(CACHE);
      const old = await cache.match(key);
      const fresh = await res.clone().text();
      const before = old ? await old.text() : null;
      if (before === fresh) return;
      await cache.put(key, res);
      if (before === null) return;                         /* first save: nothing to announce */
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(c => { if (pageKey(c.url) === key) c.postMessage({ type: 'MH_PAGE_UPDATED' }); });
    } catch (_) { /* offline: keep the saved copy */ }
    finally { delete busy[key]; }
  })();
  return busy[key];
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      /* online extras (GIFs, science sources) go straight to the network */

  if (isPage(req)) {
    const key = pageKey(req.url);
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key) || await caches.match(req, { ignoreSearch: true });
      if (hit) {
        event.waitUntil(refresh(req.url));                /* update quietly in the background */
        return hit;
      }
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
        return res;
      } catch (_) {
        return (await caches.match('MH-ELITE-PRO.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
