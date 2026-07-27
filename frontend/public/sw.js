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

  event.waitUntil(
    (async () => {
      // If the app is already open and focused, Phase 1's in-app toast has it
      // covered — skip the OS notification to avoid double-notifying.
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const focused = clientsArr.some(
        (c) => c.focused || c.visibilityState === "visible",
      );
      if (focused) return;

      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url },
        tag: url, // collapse repeats for the same round/tournament
        renotify: true,
      });
    })(),
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
      for (const c of all) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c && c.url !== self.location.origin + url) {
            try {
              await c.navigate(url);
            } catch {
              /* navigation not permitted — ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
