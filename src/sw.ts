/// <reference lib="webworker" />
// src/sw.ts: the service worker, built by vite-plugin-pwa's injectManifest strategy (vite.config.ts).
// It precaches the app shell (the build's scripts, styles, icon and the manifest), answers navigations with the cached
// app page so the app opens offline, and takes over only when a window posts {type:'SKIP_WAITING'} after a grown-up's tap
// on the update bar (pwa-kit/app-update). On activate it claims the open windows.
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/spell-forge/index.html')));

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
