/// <reference lib="webworker" />
// src/sw.ts: the service worker, built by vite-plugin-pwa's injectManifest strategy (vite.config.ts).
// It precaches the app shell (the build's scripts, styles, icon and the manifest), answers navigations with the cached
// app page so the app opens offline, and takes over only when a window posts {type:'SKIP_WAITING'} after a grown-up's tap
// on the update bar (pwa-kit/app-update). On activate it claims the open windows. It also takes a share from another app
// (the manifest's share_target, src/share/share-target.ts).
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { isShareRequest, receiveShare } from './share/share-target';

declare const self: ServiceWorkerGlobalScope;
// The build's base (vite.config.ts), a different path on Pages and on the VPS. This config has no vite/client types.
declare global {
  interface ImportMeta {
    readonly env: { readonly BASE_URL: string };
  }
}

// Share > SpellForge from another app POSTs the pictures and words here (the manifest's share_target): they are parked in Dexie and the window
// opens at the tutor (src/share/share-target.ts). Registered before the precache's own listener; a GET to the same path is a page load, left alone.
self.addEventListener('fetch', (event) => {
  const scope = self.registration.scope;
  if (isShareRequest(event.request, scope)) event.respondWith(receiveShare(event.request, scope));
});

precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)));

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
