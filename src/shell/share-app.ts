// src/shell/share-app.ts: SpellForge shares itself out, over src/share/share-out.ts (the share sheet, else the link copied).
import { appLink, shareOut, type ShareOutResult } from '../share/share-out';

/** Shares the app's own link; the result says what a tap did (see ShareOutResult). */
export function shareApp(): Promise<ShareOutResult> {
  return shareOut({
    title: 'SpellForge',
    text: 'Try SpellForge, an app that helps children practise spelling.',
    url: appLink(),
  });
}
