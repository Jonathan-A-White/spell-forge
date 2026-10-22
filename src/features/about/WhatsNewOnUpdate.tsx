// src/features/about/WhatsNewOnUpdate.tsx: pwa-kit's What's new sheet, shown once after the app starts on a newer version
// than the last one seen (mw-vmx5cb.3). It is mounted only on the grown-up screens (whatsNewShownOn): on any other screen
// nothing renders, nothing is fetched and nothing is stored, so a child in the Tutor or a game never sees it, and the
// version is remembered on the first grown-up screen reached.
import { WhatsNewSheet, useChangelog, type StorageLike } from 'pwa-kit/whats-new';
import 'pwa-kit/whats-new/styles.css';
import { APP_VERSION } from '../../version';
import { WHATS_NEW_STORAGE_KEY, whatsNewShownOn } from './whats-new-views';

interface WhatsNewOnUpdateProps {
  view: string;
  /** Where the last version seen is kept. Default: localStorage. */
  storage?: StorageLike;
  fetchFn?: typeof fetch;
}

function GrownUpWhatsNew({ storage, fetchFn }: Omit<WhatsNewOnUpdateProps, 'view'>) {
  const entries = useChangelog(import.meta.env.BASE_URL, fetchFn);
  return <WhatsNewSheet entries={entries} version={APP_VERSION} storageKey={WHATS_NEW_STORAGE_KEY} storage={storage} />;
}

export function WhatsNewOnUpdate({ view, storage, fetchFn }: WhatsNewOnUpdateProps) {
  if (!whatsNewShownOn(view)) return null;
  return <GrownUpWhatsNew storage={storage} fetchFn={fetchFn} />;
}
