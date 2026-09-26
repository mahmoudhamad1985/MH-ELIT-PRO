/* MH ELITE PRO — offline support (service worker)
   Upload this file next to MH-ELITE-PRO.html in the same GitHub repository.
   - The app opens without internet after the first visit.
   - When online, the newest uploaded version is always loaded (network first), then saved for offline use. */
const CACHE = 'mh-elite-pro-v1';
const RUNTIME = 'mh-elite-pro-rt-v1';
const APP = new URL('MH-ELITE-PRO.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.add(new Request(APP, { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Lets the page force this new version to take over immediately when the person taps "Update now".
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Other pages in the same repository (e.g. MH-BODY-CHECK.html): network first, own cached copy offline.
  // They must never be stored under the app's cache entry.
  if (req.mode === 'navigate' && url.href.split('?')[0].split('#')[0] !== APP) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-store' }), 6000);
        if (res && res.ok) cache.put(url.href.split('?')[0], res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return (await cache.match(url.href.split('?')[0])) || Response.error();
      }
    })());
    return;
  }

  // The app page: newest version when online, cached copy when offline or on a very slow network.
  if (req.mode === 'navigate' || url.href.split('?')[0] === APP) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-store' }), 6000);
        if (res && res.ok) cache.put(APP, res.clone()).catch(() => {});
        return res;
      } catch (e) {
        return (await cache.match(APP)) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Other resources (exercise images, research updates): cached copy first, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const hit = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => hit || Response.error());
    return hit || net;
  })());
});
