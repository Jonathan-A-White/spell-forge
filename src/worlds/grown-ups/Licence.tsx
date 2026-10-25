// src/worlds/grown-ups/Licence.tsx: the Licence section of the Grown-ups screen. Buy reads the licence for this device's
// key through bsv-kit's licence path (src/grist/factory.ts checkLicence) and hands the reading to the one function that
// knows (src/shell/licence-gate.ts); Get a licence opens the store beside it. With a licence Buy shows "licensed".
// The tutor is the licensed part; nothing else on this screen, or in the app, waits on it.

import { useState, useSyncExternalStore } from 'react';
import type { PrivateKey } from '@bsv/sdk';
import type { licence } from 'bsv-kit/bsv';
import { deviceKey } from '../../features/tutor/tutor-flow';
import { checkLicence } from '../../grist';
import { licenceState, setLicenceStatus, subscribeLicence } from '../../shell/licence-gate';
import { STORE_URL } from '../../shell/store';

export interface LicenceProps {
  /** This device's key; the wallet's when absent. */
  getKey?: () => Promise<PrivateKey | undefined>;
  /** Reads the licence for a key; bsv-kit's path over WhatsOnChain when absent. */
  check?: (key: PrivateKey) => Promise<licence.LicenceStatus>;
}

const NO_KEY = "This device has no key yet. Make one under This device's key first.";
const NOT_FOUND = 'No licence found for this device yet. Use Get a licence, then tap Buy again.';
const INDEXING = 'Your licence is on its way. Tap Buy again in a minute.';
const CANNOT_CHECK = 'The licence could not be checked. Check the internet and try again.';

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97] disabled:opacity-70';
const BUY = `${BUTTON} bg-sf-primary text-sf-primary-text hover:bg-sf-primary-hover`;
const LICENSED = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading`;
const GET = `${BUTTON} inline-flex items-center bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;

export function Licence({ getKey = deviceKey, check = checkLicence }: LicenceProps) {
  const state = useSyncExternalStore(subscribeLicence, licenceState);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const licensed = state === 'licensed';

  async function buy() {
    setBusy(true);
    setNote(null);
    try {
      const key = await getKey();
      if (!key) {
        setNote(NO_KEY);
        return;
      }
      const status = await check(key);
      setLicenceStatus(status);
      if (status.state === 'indexing') setNote(INDEXING);
      else if (status.state !== 'held') setNote(NOT_FOUND);
    } catch {
      setNote(CANNOT_CHECK);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="licence-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <h2 id="licence-title" className="text-sf-heading font-bold text-lg">Licence</h2>
      <p className="text-sf-muted text-sm">The tutor needs a licence. Everything else works without one.</p>
      <div className="flex flex-wrap gap-3">
        {licensed ? (
          <button type="button" disabled className={LICENSED} style={TAP}>
            licensed
          </button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={() => void buy()} className={BUY} style={TAP}>
              Buy
            </button>
            <a className={GET} style={TAP} href={STORE_URL} target="_blank" rel="noopener noreferrer">
              Get a licence
            </a>
          </>
        )}
      </div>
      {note && (
        <p role="status" className="text-sf-heading">
          {note}
        </p>
      )}
    </section>
  );
}
