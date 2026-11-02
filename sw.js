/* ---------------------------------------------------------------
   The service worker, so the app can be installed on a phone and
   keeps working where the Wi-Fi does not.

   It is built around the ?v= number the app already carries. Every
   script and stylesheet is requested as styles.css?v=54, and that URL
   never changes meaning: bump the number and it is a different URL.
   So those can be cached for good and served from the cache first,
   which is what makes the app open instantly and work offline.

   The pages themselves carry no ?v=, and they are the files that say
   which version to load, so they are fetched from the network first
   and only fall back to the cache when there is no network. That way
   a release is never half-applied — the one mutable file is always
   the freshest the connection allows.

   Nothing from GitHub is touched. Borrowing has to be real-time, and
   a cached answer there would be a lie.
   --------------------------------------------------------------- */

/* The release number, taken from this worker's own URL — js/pwa.js registers
   it as sw.js?v=56. So the ?v= in the two HTML files remains the only place a
   release number is written, and a new release installs a new worker and a
   fresh cache without anyone remembering a second thing to bump. */
const VERSION = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'classroom-library-' + VERSION;

self.addEventListener('install', e => {
  // Take over straight away rather than waiting for every tab to close:
  // a stale worker lingering after a release is the thing to avoid.
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', e => {
  const request = e.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;     // GitHub, book covers, lookups

  // A URL carrying ?v= cannot change without the URL changing.
  if (url.searchParams.has('v')) { e.respondWith(cacheFirst(request)); return; }

  e.respondWith(networkFirst(request));
});
