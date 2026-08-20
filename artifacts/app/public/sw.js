/**
 * The service worker behind the installable web app.
 *
 * An installed icon that opens a "no internet" page the first time a train
 * goes into a tunnel is worse than no installed icon, so this exists to make
 * the app open. It is deliberately small: a service worker is the hardest
 * thing on the web to take back once it is shipped -- it outlives the page
 * that registered it and serves the next visit before any of the app's own
 * code runs -- so every rule here is one that cannot strand somebody on a
 * stale build.
 *
 * What that rules out, and why:
 *
 *  • **The API is never touched.** Not cached, not read from cache, not even
 *    intercepted. It carries other people's work and a bearer token, and a
 *    cached answer to "what is on my schedule today" is a wrong answer
 *    presented as a right one. The app already has a proper screen for a
 *    request that could not be made (components/LoadFailure.tsx), and showing
 *    it beats showing yesterday.
 *  • **Navigations go to the network first.** The cached document is a
 *    fallback for a failed request, never a preference. A deploy therefore
 *    reaches everyone on their next load, and it is impossible for this to
 *    pin a visitor to an old shell.
 *  • **Only content-hashed assets are served from cache first.** Everything
 *    under assets/ has a hash in its filename and is immutable by
 *    construction, so a cache hit is the same bytes the network would return.
 *    Anything else is revalidated.
 *
 * Bumping VERSION retires every previous cache on the next activation, which
 * is the lever to pull if a release ever needs to invalidate what is stored.
 */

const VERSION = "v1";
const CACHE = `casparel-${VERSION}`;

/**
 * The app's mount point, taken from the registration rather than written down:
 * this file is copied to the output verbatim, so it cannot be told what
 * BASE_PATH was at build time.
 */
const BASE = new URL(self.registration.scope).pathname;

/** The document cached as the fallback for a navigation that cannot be made. */
const SHELL = `${BASE}resources`;

/**
 * Warm the shell so the first offline launch has something to open.
 *
 * A failure here is not a failed install: the worker is still perfectly able
 * to serve from the network, and refusing to activate over one uncached
 * document would leave the app with no worker at all.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.add(new Request(SHELL, { cache: "reload" }));
      } catch {
        /* offline at install, or the shell 500ed; the worker still works */
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("casparel-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      // Navigation preload lets the browser start the network request in
      // parallel with booting this worker, so putting a worker in front of a
      // network-first strategy does not cost a round trip's worth of latency.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * Lets the page retire a worker on demand.
 *
 * The escape hatch for the failure this file is most exposed to: if a future
 * version of this worker turns out to break the app, the fix has to be able to
 * reach browsers that are already running the broken one.
 */
self.addEventListener("message", (event) => {
  if (event.data === "casparel-skip-waiting") self.skipWaiting();
});

/** Immutable by construction: the build puts a content hash in the filename. */
function isHashedAsset(url) {
  return url.pathname.startsWith(`${BASE}assets/`);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Fresh when the network answers, cached when it does not.
 *
 * `preload` is the response the browser already started fetching for a
 * navigation; awaiting it rather than issuing a second request is the whole
 * benefit of navigation preload.
 */
async function networkFirst(request, preload) {
  try {
    const response = (await preload) || (await fetch(request));
    if (response && response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = await caches.match(SHELL);
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Another origin's caching policy is its own business, and this worker has
  // no way to know whether a response of theirs is safe to keep.
  if (url.origin !== self.location.origin) return;
  // Everything the API serves is either private, or changes without warning,
  // or both.
  if (url.pathname.startsWith(`${BASE}api/`)) return;

  event.respondWith(
    isHashedAsset(url)
      ? cacheFirst(request)
      : networkFirst(request, event.preloadResponse),
  );
});
