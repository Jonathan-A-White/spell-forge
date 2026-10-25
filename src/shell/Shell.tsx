// src/shell/Shell.tsx: the root, and the phone rules the whole app lives by. The page never scrolls: html, body, #root and the
// Shell root are clipped, with a top bar and a bottom bar that carry the safe-area insets, and between them ONE scroll box that
// every screen is drawn in. The update bar and the What's new sheet sit above the screen and the
// debug overlays below. The Shell also starts what is app-wide: the scroll guard, the tap guard, the long press that says a word,
// and the one request to keep the storage. Above the bottom bar sits the Ask button, once a screen has told the tutor where he is.
import { useEffect } from 'react';
import { UpdateBanner } from '../features/update';
import { WhatsNewOnUpdate } from '../features/about';
import { TtsDebugOverlay } from '../audio/tts-debug-overlay';
import { DebugOverlay } from '../debug';
import { AskTutorButton } from './AskTutorButton';
import { useApp } from './app-state';
import { installScrollGuard } from './focus';
import { HearAnyWord } from './HearAnyWord';
import { usePersistStorage } from './persist';
import { useTapGuard } from './tap-guard';
import { WorldSwitch } from './WorldSwitch';
import { viewRoute, type ViewId } from './worlds';

/** The screens where the word is the test: a long press does not say it there (HearAnyWord skips a [data-drill] box). */
const DRILL_VIEWS: readonly ViewId[] = ['practice', 'practice-games', 'quiz', 'learning'];

export function Shell() {
  const { view, setView, profiles, activeProfile, ttsDebugEnabled, debugModeEnabled } = useApp();

  useEffect(() => installScrollGuard(), []);
  useTapGuard(view);
  usePersistStorage(profiles.length > 0 || activeProfile !== null);

  // The Ask button shows on views where the DB is ready
  const showAsk = view !== 'loading' && view !== 'db-blocked' && view !== 'onboarding';

  return (
    <div data-shell className="sf-shell">
      <HearAnyWord />
      <div data-shell-bar="top" className="sf-bar-top" aria-hidden="true" />
      <UpdateBanner view={view} />
      <WhatsNewOnUpdate view={view} />
      <main data-scroll-box data-drill={DRILL_VIEWS.includes(view) ? '' : undefined} className="sf-scroll-box">
        <WorldSwitch route={viewRoute(view)} />
      </main>
      {showAsk && <AskTutorButton view={view} open={setView} />}
      <div data-shell-bar="bottom" className="sf-bar-bottom" aria-hidden="true" />
      <TtsDebugOverlay enabled={ttsDebugEnabled} />
      <DebugOverlay enabled={debugModeEnabled} />
    </div>
  );
}
