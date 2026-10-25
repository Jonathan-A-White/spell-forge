// src/shell/app-state.ts: the app's state. useAppState holds the whole app's state (the open child, his lists, where
// he is) and what the screens ask to be done, and hands it to the Shell and the screens through useApp().
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useBackButton } from '../hooks/use-back-button';
import { setSpeechVoice, useAudioBusy, warmUp as warmUpTts } from '../audio';
import { useTtsDebug } from '../audio/tts-debug-state';
import { useDebugMode } from '../debug';
import { startPhotoImportQueue } from '../features/word-lists/photo-import';
import { audioManager, ocrManager } from './services';
import { saveLastRoute } from './last-route';
import { deriveActive } from './derive';
import { useLearner } from './use-learner';
import { useLists } from './use-lists';
import { useProfileActions } from './use-profile-actions';
import { useBoot } from './use-boot';
import { landingView } from './landing';
import { TRANSIENT_VIEWS, openView, viewRoute, type ViewId } from './worlds';

export function useAppState() {
  const [view, setView] = useState<ViewId>('loading');
  const landingRef = useRef<ViewId | null>(null);

  const learner = useLearner(setView, landingRef);
  const lists = useLists(learner, setView);
  const profileActions = useProfileActions(learner, setView);
  const boot = useBoot(learner, setView, landingRef);
  const { activeProfile, refreshListData } = learner;
  const { setPracticeWordFilter, setEditingList, setViewingList, setViewingTestResult } = lists;

  // Photo imports waiting on the factory: one pass now, on 'online', and every 20 s while any waits.
  useEffect(() => startPhotoImportQueue({ ocrManager }), []);

  const audioBusy = useAudioBusy(audioManager);
  // One voice for the tutor and the spelling words: the open profile's Tutor voice.
  const tutorVoice = activeProfile?.settings.tutorVoice;
  useEffect(() => setSpeechVoice(tutorVoice), [tutorVoice]);
  const [ttsDebugEnabled, toggleTtsDebug] = useTtsDebug();
  const [debugModeEnabled, toggleDebugMode] = useDebugMode();

  // Prime the TTS engine on the first user interaction so Chrome Android
  // unlocks audio and loads voices before the user taps "Hear it".
  useEffect(() => {
    const handler = () => {
      warmUpTts();
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('touchstart', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
  }, []);

  // Sync view state with browser history so the OS back button
  // navigates within the app instead of closing it.
  useBackButton(view, setView, landingView(), TRANSIENT_VIEWS as ViewId[]);

  // Keep the place he is at, so a reopen lands there (declared after useBackButton: the entry is pushed first).
  useEffect(() => {
    if (!TRANSIENT_VIEWS.includes(view)) saveLastRoute(viewRoute(view));
  }, [view]);

  // Navigate back through browser history instead of hardcoding destinations.
  // Performs cleanup for the current view before navigating.
  const goBack = useCallback(() => {
    if (view === 'practice') {
      setPracticeWordFilter(null);
    } else if (view === 'learning') {
      refreshListData();
    } else if (view === 'list-editor') {
      setEditingList(null);
    } else if (view === 'word-list-detail') {
      setViewingList(null);
    } else if (view === 'test-result-detail') {
      setViewingTestResult(null);
    }
    window.history.back();
  }, [view, refreshListData, setPracticeWordFilter, setEditingList, setViewingList, setViewingTestResult]);

  /** Opens a screen by its id or route, the way a tutor "go" answer asks; false when there is no such screen. */
  const go = useCallback((id: string) => openView(id, setView), []);

  const [mountTime] = useState(Date.now);
  const derived = deriveActive(learner.wordLists, learner.allWords, learner.allStats, mountTime);

  return {
    view, setView, goBack, go, audioBusy, audioManager, ocrManager,
    ttsDebugEnabled, toggleTtsDebug, debugModeEnabled, toggleDebugMode,
    ...learner, ...lists, ...profileActions, ...boot, ...derived,
  };
}

export type AppState = ReturnType<typeof useAppState>;

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp needs an AppProvider above it.');
  return app;
}
