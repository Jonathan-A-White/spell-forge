// src/shell/Shell.tsx: the root. The update bar and the What's new sheet above, the world and screen the route names
// in the middle, the offline-feedback banner and the debug overlays below.
import { UpdateBanner } from '../features/update';
import { WhatsNewOnUpdate } from '../features/about';
import { FeedbackSyncBanner } from '../features/feedback/feedback-sync-banner';
import { TtsDebugOverlay } from '../audio/tts-debug-overlay';
import { DebugOverlay } from '../debug';
import { useApp } from './app-state';
import { WorldSwitch } from './WorldSwitch';
import { viewRoute } from './worlds';

export function Shell() {
  const { view, ttsDebugEnabled, debugModeEnabled } = useApp();

  // The offline-feedback banner shows on views where the DB is ready
  const showSyncBanner = view !== 'loading' && view !== 'db-blocked' && view !== 'onboarding';

  return (
    <>
      <UpdateBanner view={view} />
      <WhatsNewOnUpdate view={view} />
      <WorldSwitch route={viewRoute(view)} />
      {showSyncBanner && <FeedbackSyncBanner />}
      <TtsDebugOverlay enabled={ttsDebugEnabled} />
      <DebugOverlay enabled={debugModeEnabled} />
    </>
  );
}
