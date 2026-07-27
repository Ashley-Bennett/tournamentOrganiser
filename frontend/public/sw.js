// Matchamp service worker — Web Push (Phase 2).
// Dependency-free. Handles incoming pushes and notification taps.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Matchamp";
  const body = data.body || "";
  const url = data.url || "/";

  // Always show a notification for every push. Skipping it (even when the app
  // is focused) is a silent push, which Chrome penalises as "possible spam".
  // Foreground double-notify is avoided on the client side instead: the in-app
  // toast is suppressed when OS push permission is granted.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/badge-96.png", // monochrome silhouette for the status bar
      data: { url },
      tag: url, // collapse repeats for the same round/tournament
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Already on the target page? Just focus it.
      const exact = all.find((c) => {
        try {
          return new URL(c.url).pathname === url;
        } catch {
          return false;
        }
      });
      if (exact) {
        await exact.focus();
        return;
      }

      // App open elsewhere — focus it and ask the SPA to route to the pairing.
      const open = all.find((c) => "focus" in c);
      if (open) {
        await open.focus();
        open.postMessage({ type: "matchamp:navigate", url });
        return;
      }

      // App closed — open a new window straight at the pairing page.
      await self.clients.openWindow(url);
    })(),
  );
});
