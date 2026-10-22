// src/features/update/start-updates.ts: hands the browser's service worker registration to pwa-kit/app-update, which
// looks for a new build on start, on return to the foreground and every 30 minutes, and offers a waiting one (UpdateBanner).
// No hasNewsSince: SpellForge keeps no changelog to judge by, so every waiting build is offered.
import { startAppUpdates, type AppUpdates, type UpdateContainer, type UpdateRegistration } from 'pwa-kit/app-update';
import { APP_VERSION } from '../../version';

export interface UpdateDeps {
  container: UpdateContainer;
  reload: () => void;
}

export function startUpdates(registration: UpdateRegistration, deps?: UpdateDeps): AppUpdates {
  const { container, reload } = deps ?? {
    container: navigator.serviceWorker,
    reload: () => window.location.reload(),
  };
  return startAppUpdates({ container, registration, reload }, { version: APP_VERSION });
}
