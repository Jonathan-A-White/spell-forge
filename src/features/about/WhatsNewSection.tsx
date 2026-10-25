// src/features/about/WhatsNewSection.tsx: About's version row (mw-vmx5cb.3): the What's new button (pwa-kit's sheet,
// every version in public/changelog.json) and Check for updates, which asks the service worker for a new build. A build
// it finds is offered as Update now here and in the grown-up bar (src/features/update).
import { useState, type ReactNode } from 'react';
import { applyUpdate } from 'pwa-kit/app-update';
import { CheckForUpdates, WhatsNewSheet, useChangelog, type UpdateRegistration } from 'pwa-kit/whats-new';
import 'pwa-kit/whats-new/styles.css';
import { APP_VERSION } from '../../version';
import { WHATS_NEW_STORAGE_KEY } from './whats-new-views';

export interface WhatsNewSectionProps {
  /** Where changelog.json is read from. Default: the page's fetch. */
  fetchFn?: typeof fetch;
  /** The service worker registration to check. Default: the browser's, asked when the button is pressed. */
  registration?: UpdateRegistration | null;
  /** A line kept beside the version (About's last tutor answer time). */
  versionNote?: ReactNode;
}

const BUTTON_CLASS =
  'px-4 py-2 rounded-lg border-2 border-sf-border bg-sf-surface text-sf-text font-bold hover:bg-sf-surface-hover';

export function WhatsNewSection({ fetchFn, registration, versionNote }: WhatsNewSectionProps) {
  const entries = useChangelog(import.meta.env.BASE_URL, fetchFn);
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">Updates</h2>
      <div className="p-4 rounded-xl border-2 border-sf-border bg-sf-surface space-y-3">
        <p className="text-sm text-sf-text">{`SpellForge v${APP_VERSION}`}</p>
        {versionNote}
        {entries && entries.length > 0 ? (
          <button type="button" className={BUTTON_CLASS} onClick={() => setOpen(true)}>
            What&apos;s new
          </button>
        ) : null}
        <CheckForUpdates
          registration={registration}
          updateReady={
            <>
              <span>Update ready</span>{' '}
              <button type="button" className="text-sf-primary underline font-bold" onClick={applyUpdate}>
                Update now
              </button>
            </>
          }
        />
      </div>
      <WhatsNewSheet
        entries={entries}
        version={APP_VERSION}
        storageKey={WHATS_NEW_STORAGE_KEY}
        open={open}
        onClose={() => setOpen(false)}
      />
    </section>
  );
}
