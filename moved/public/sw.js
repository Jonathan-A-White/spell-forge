// The worker at the old address. The old app (when it lived here) registered a worker that caches its whole shell, so it would keep opening the old
// app over this page. A browser looks for a changed /spell-forge/sw.js on every visit: this one takes over at once, deletes every cache the old
// one made, and reloads the open windows so they show the moved page. It never caches anything and answers no request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => undefined)));
    })(),
  );
});
