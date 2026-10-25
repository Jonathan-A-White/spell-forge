// src/features/about/whats-new-views.ts: where the What's new sheet may open by itself after an update (mw-vmx5cb.3).
// It is a modal, so the list is narrower than the update bar's (src/features/update): only the screens a grown-up
// reaches on purpose. An allow-list, so a screen added later shows no sheet until someone decides it should.
const WHATS_NEW_VIEWS: ReadonlySet<string> = new Set(['about', 'settings', 'requests', 'conversations']);

/** The localStorage key of the last version whose What's new was shown. */
export const WHATS_NEW_STORAGE_KEY = 'sf-whats-new-seen';

export function whatsNewShownOn(view: string): boolean {
  return WHATS_NEW_VIEWS.has(view);
}
