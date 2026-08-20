/**
 * Registers the service worker that makes the web app installable and lets an
 * installed copy open without a network.
 *
 * Two deliberate refusals:
 *
 * **Development builds get no worker.** A worker that intercepts requests
 * while Vite is hot-reloading is a source of confusing staleness in the one
 * place staleness is hardest to reason about, and there is nothing to gain: a
 * dev server is already local.
 *
 * **Automated browsers get no worker.** Every audit in `scripts/` renders the
 * production build in Playwright, and several of them are about what the app
 * does when the network fails -- exactly the case a worker exists to change.
 * Leaving it out means those audits keep measuring the app rather than the
 * cache, and it removes a whole class of cross-run flake, because a worker
 * installed by one audit outlives the page that installed it.
 *
 * Nothing here forces an update. A newly installed worker waits, and takes
 * over once the app's tabs are closed, which is the browser's default and the
 * only version of this that cannot pull chunks out from under a page somebody
 * is working in. It costs nothing: the worker prefers the network for
 * everything except immutable, content-hashed files, so a visitor still on the
 * previous worker is still served the current deploy.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  if (navigator.webdriver) return;

  const base = import.meta.env.BASE_URL || "/";
  // After load, so that registering never competes with the first render for
  // bandwidth on the visit that has nothing cached yet.
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .catch(() => {
        // An unavailable worker is a slower app, not a broken one: every
        // request it would have served is one the browser makes anyway.
      });
  });
}
