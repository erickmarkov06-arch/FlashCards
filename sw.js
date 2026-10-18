/**
 * sw.js — the service worker that makes StudyDeck work offline.
 *
 * Strategy: "network first, cache as backup".
 *   - When you're online, every file is fetched fresh (so new decks and fixes show up straight away)
 *     and a copy is saved in the cache.
 *   - When you're offline (or the network is very slow), the saved copy is used instead.
 *
 * If you add a new file to the app (e.g. a new js/views/*.js), add it to APP_FILES below
 * and bump CACHE_VERSION so phones download it for offline use.
 */
const CACHE_VERSION = 'v3';
const CACHE_NAME = `studydeck-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 4000; // after this long, fall back to the cached copy

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/utils.js',
  'js/store.js',
  'js/data.js',
  'js/flipcard.js',
  'js/speech.js',
  'js/views/home.js',
  'js/views/deck.js',
  'js/views/flashcards.js',
  'js/views/quiz.js',
  'js/views/write.js',
  'js/views/match.js',
  'js/views/review.js',
  'js/views/stats.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'decks/index.json',
];

// 1. Install: save the app's own files, then every deck listed in the index.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' })));
      try {
        const index = await (await fetch('decks/index.json', { cache: 'no-cache' })).json();
        await cache.addAll(index.decks.map((d) => `decks/${d.path}`));
      } catch (err) {
        console.warn('Could not pre-cache decks:', err);
      }
      await self.skipWaiting(); // start using the new version straight away
    })()
  );
});

// 2. Activate: delete caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('studydeck-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

// 3. The page can ask us to save extra files (it sends the list of decks after loading the index).
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const url of event.data.urls) {
        if (!(await cache.match(url))) {
          try {
            await cache.add(url);
          } catch {
            /* offline or missing: try again next time */
          }
        }
      }
    })()
  );
});

// 4. Fetch: network first, cache as backup.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return; // leave other requests alone

  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  // Page loads (e.g. "/" or "/index.html?x") all use the cached index.html when offline.
  const cacheKey = request.mode === 'navigate' ? 'index.html' : request;

  const network = fetch(request.url, { cache: 'no-cache' }).then((response) => {
    if (response.ok) cache.put(cacheKey, response.clone());
    return response;
  });
  network.catch(() => {}); // avoid "unhandled rejection" noise if we already answered from the cache

  // Whichever comes first: the network answer, or the timeout (then use the cache if we have it).
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const cached = await cache.match(cacheKey, { ignoreSearch: true });
    return cached || (await network);
  } catch {
    const cached = await cache.match(cacheKey, { ignoreSearch: true });
    if (cached) return cached;
    return new Response('You are offline and this file has not been saved yet.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
