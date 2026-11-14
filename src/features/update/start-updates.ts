// src/features/update/start-updates.ts: hands the browser's service worker registration to pwa-kit/app-update, which
// looks for a new build on start, on return to the foreground and every 30 minutes, and offers a waiting one (UpdateBanner).
// The judge is pwa-kit/whats-new's hasNewsSince over public/changelog.json, read fresh from the server: a waiting build with
// no line after the running version (a landing that wrote none) is taken quietly at start-up or when the app is hidden and
// never offered; one with a line is offered; a changelog that cannot be read offers the build (mw-6ww.175.47).
import { startAppUpdates, type AppUpdates, type UpdateContainer, type UpdateRegistration } from 'pwa-kit/app-update';
import { fetchChangelog, hasNewsSince, type ReadChangelog } from 'pwa-kit/whats-new';
import { APP_VERSION } from '../../version';

export interface UpdateDeps {
  container: UpdateContainer;
  reload: () => void;
  /** Reads the waiting build's changelog; the page's changelog.json, fetched fresh, when not given. */
  read?: ReadChangelog;
}

export function startUpdates(registration: UpdateRegistration, deps?: UpdateDeps): AppUpdates {
  const { container, reload, read } = deps ?? {
    container: navigator.serviceWorker,
    reload: () => window.location.reload(),
    read: undefined,
  };
  const readChangelog: ReadChangelog = read ?? (() => fetchChangelog(import.meta.env.BASE_URL));
  return startAppUpdates({ container, registration, reload }, { version: APP_VERSION, hasNewsSince: hasNewsSince(readChangelog) });
}
