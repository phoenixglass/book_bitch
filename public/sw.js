// Service worker for offline support.
// Strategy: cache-first for the app shell and built assets (so the app boots
// offline), network-only for /api/* (AI calls and anything else that needs a
// live server — there is nothing useful to serve from cache there).

const CACHE_NAME = 'book-bitch-cache-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

// Hosts commonly answer with `Vary: Origin`, and cache matching honours Vary.
// A precached entry is stored under a no-CORS request that carries no Origin
// header, while the page fetches its module scripts with one — so a strict
// match misses every precached asset and the app falls through to the network
// it was supposed to be able to do without. Only one representation per URL is
// ever stored here (the filenames are content-hashed), so Vary carries no
// information worth honouring.
const MATCH_OPTS = { ignoreVary: true };

// The built JS/CSS filenames are content-hashed, so they can't be listed here.
// Read them out of the freshly fetched index.html instead. Without this the
// shell caches on the first visit but the bundle it <script>s does not — the
// page then boots to a blank screen the first time it's opened offline, since
// the cached index.html asks for an asset that was never stored.
async function precacheBuiltAssets(cache) {
  const res = await fetch('/index.html', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.text();
  const urls = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        // Best-effort: a failure here must not abort the install, or the
        // worker never activates and there's no offline support at all.
        await precacheBuiltAssets(cache).catch(() => {});
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: try the network first so users always get fresh app code
  // when online, but fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('/index.html', MATCH_OPTS))
          ?? new Response('Offline and no cached copy of the app is available yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })),
    );
    return;
  }

  // Static assets (hashed JS/CSS/images): cache-first, refresh in the
  // background so the next load picks up changes.
  event.respondWith(
    caches.match(request, MATCH_OPTS).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? fetchPromise;
    }),
  );
});
