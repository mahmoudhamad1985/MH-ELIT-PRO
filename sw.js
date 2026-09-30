/* MH ELITE PRO — service worker
   Pages (HTML) are NETWORK-FIRST: when online the client always gets the latest uploaded version,
   when offline the last saved copy opens. Other files (icons, manifest) are cache-first.
   A new version of this file activates immediately, and the app reloads itself once onto the new version. */
const CACHE = 'mh-elite-pro-2026-09-30';
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
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPage(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && (accept.includes('text/html') || /\.html?(\?|$)/i.test(new URL(request.url).pathname));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      /* online extras (GIFs, science sources) go straight to the network */

  if (isPage(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then(r => r || caches.match('MH-ELITE-PRO.html'))
            .then(r => r || caches.match('./'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
