// src/features/update/update-banner.tsx: a quiet bar for the grown-up, shown while a newer build waits (pwa-kit/app-update).
// It is a plain block in the page's flow above the screen, never an overlay, and it is mounted only on the grown-up
// screens (updateBarShownOn): a child in the Tutor or a game never sees it. Later hides it until the next page load.
import { useState } from 'react';
import { applyUpdate, useUpdateState } from 'pwa-kit/app-update';
import { updateBarShownOn } from './update-views';

export function UpdateBanner({ view }: { view: string }) {
  const state = useUpdateState();
  const [dismissed, setDismissed] = useState(false);
  if (state === 'none' || dismissed || !updateBarShownOn(view)) return null;
  const updating = state === 'updating';
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 px-3 py-2 text-sm bg-sf-primary text-sf-primary-text"
    >
      <span>A new version of SpellForge is ready.</span>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={updating}
        className="bg-white text-sf-primary font-bold px-3 py-1 rounded-lg whitespace-nowrap disabled:opacity-70"
      >
        {updating ? 'Updating…' : 'Update now'}
      </button>
      {updating ? null : (
        <button type="button" onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100 px-2 py-1">
          Later
        </button>
      )}
    </div>
  );
}
