// src/shell/share-app.ts: Kestrel shares itself out, over src/share/share-out.ts (the share sheet, else the link copied).
import { appLink, shareOut, type ShareOutResult } from '../share/share-out';

/** Shares the app's own link; the result says what a tap did (see ShareOutResult). */
export function shareApp(): Promise<ShareOutResult> {
  return shareOut({
    title: 'Kestrel',
    text: 'Try Kestrel, an app that helps children practise spelling.',
    url: appLink(),
  });
}
