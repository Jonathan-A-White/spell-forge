// src/App.tsx — Root component: routing, state management, event bus wiring

import { useState, useEffect, useCallback } from 'react';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  SessionLog,
  StreakData,
  AccessibilitySettings,
  ImportStrategy,
} from './contracts/types';
import { createEventBus } from './contracts/events';
import { db } from './data/db';
import { profileRepo } from './data/repositories/profile-repo';
import { wordListRepo } from './data/repositories/word-list-repo';
import { wordRepo } from './data/repositories/word-repo';
import { statsRepo } from './data/repositories/stats-repo';
import { sessionRepo } from './data/repositories/session-repo';
import { streakRepo } from './data/repositories/streak-repo';
import { applySettings, mergeSetting, validateSettings } from './accessibility/settings';
import { ProfileSelector } from './features/profiles/profile-selector';
import { FirstRun } from './features/onboarding/first-run';
import { HomeScreen } from './features/dashboard/home-screen';
import { ProgressView } from './features/dashboard/progress-view';
import { PracticeScreen } from './features/practice/practice-screen';
import { PracticeGames } from './features/practice/practice-games';
import { ListEditor } from './features/word-lists/list-editor';
import { WordListsView } from './features/word-lists/word-lists-view';
import { FeedbackForm } from './features/feedback/feedback-form';
import { SettingsPanel } from './features/settings/settings-panel';
import { AudioManagerImpl, TtsProvider } from './audio';
import { createOcrManager } from './ocr';
import { rewardTracker } from './features/rewards';
import { exportProfile, importProfile } from './data/import-export';
import type { NamedPreset } from './accessibility/presets';
import { v4 as uuidv4 } from 'uuid';

type AppView = 'loading' | 'onboarding' | 'profile-select' | 'home' | 'progress' | 'practice' | 'practice-games' | 'list-editor' | 'word-lists' | 'settings' | 'feedback';

/** Race a promise against a timeout. Rejects if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database operation timed out')), ms),
    ),
  ]);
}

const DB_TIMEOUT_MS = 8000;

const eventBus = createEventBus();

const audioManager = new AudioManagerImpl();
audioManager.registerProvider(new TtsProvider());

const ocrManager = createOcrManager();

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [allStats, setAllStats] = useState<WordStats[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [editingList, setEditingList] = useState<WordList | null>(null);

  const selectProfile = useCallback(async (profile: Profile) => {
    setActiveProfile(profile);
    applySettings(profile.settings);

    try {
      const [words, stats, lists, streak] = await withTimeout(
        Promise.all([
          wordRepo.getByProfileId(profile.id),
          statsRepo.getByProfileId(profile.id),
          wordListRepo.getByProfileId(profile.id),
          streakRepo.get(profile.id),
        ]),
        DB_TIMEOUT_MS,
      );

      setAllWords(words);
      setAllStats(stats);
      setWordLists(lists);
      setStreakData(streak);
    } catch {
      // If loading profile data fails or times out, proceed with empty data
    }

    setView('home');
    eventBus.emit({ type: 'profile:switched', payload: { profileId: profile.id } });
  }, []);

  // Load initial data
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const profs = await withTimeout(profileRepo.getAll(), DB_TIMEOUT_MS);
        if (cancelled) return;
        setProfiles(profs);

        if (profs.length === 0) {
          setView('onboarding');
        } else if (profs.length === 1) {
          await selectProfile(profs[0]);
        } else {
          setView('profile-select');
        }
      } catch {
        if (!cancelled) {
          // If DB fails to load or times out, fall back to onboarding so the app isn't stuck
          setView('onboarding');
        }
      }
    }
    load();

    return () => { cancelled = true; };
  }, [selectProfile]);

  const handleOnboardingComplete = useCallback(
    async (name: string, themeId: string, settings: AccessibilitySettings) => {
      const profile = await profileRepo.create({
        name,
        avatar: `${themeId}-1`,
        themeId,
        createdAt: new Date(),
        settings,
      });
      setProfiles([profile]);
      await selectProfile(profile);
    },
    [selectProfile],
  );

  const handleSessionEnd = useCallback(
    async (log: SessionLog) => {
      if (!activeProfile) return;
      await sessionRepo.create(log);
      const streak = await streakRepo.recordSession(
        activeProfile.id,
        new Date(),
        log.wordsAttempted,
      );
      setStreakData(streak);
      eventBus.emit({ type: 'session:ended', payload: { sessionLog: log } });

      if (streak) {
        eventBus.emit({ type: 'streak:updated', payload: streak });
      }

      // Process reward for session completion
      const reward = rewardTracker.processEvent(
        activeProfile.id,
        activeProfile.themeId,
        { type: 'session:ended', payload: { sessionLog: log } },
      );
      eventBus.emit({ type: 'reward:earned', payload: reward });
    },
    [activeProfile],
  );

  const handleStatsUpdate = useCallback(
    async (updated: WordStats) => {
      await statsRepo.update(updated.id, updated);
      setAllStats((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
    },
    [],
  );

  const refreshListData = useCallback(async () => {
    if (!activeProfile) return;
    const updatedWords = await wordRepo.getByProfileId(activeProfile.id);
    const updatedStats = await statsRepo.getByProfileId(activeProfile.id);
    const updatedLists = await wordListRepo.getByProfileId(activeProfile.id);
    setAllWords(updatedWords);
    setAllStats(updatedStats);
    setWordLists(updatedLists);
  }, [activeProfile]);

  const handleSaveList = useCallback(
    async (name: string, words: string[], testDate: Date | null) => {
      if (!activeProfile) return;

      if (editingList) {
        // Update existing list metadata
        await wordListRepo.update(editingList.id, { name, testDate });

        // Diff words: remove deleted, add new, keep existing
        const existingWords = await wordRepo.getByListId(editingList.id);
        const existingTexts = new Set(existingWords.map((w) => w.text));
        const newTexts = new Set(words);

        // Delete words that were removed
        for (const existing of existingWords) {
          if (!newTexts.has(existing.text)) {
            await wordRepo.delete(existing.id);
          }
        }

        // Add words that are new
        for (const wordText of words) {
          if (!existingTexts.has(wordText)) {
            const word: Word = {
              id: uuidv4(),
              listId: editingList.id,
              profileId: activeProfile.id,
              text: wordText,
              phonemes: [],
              syllables: [],
              patterns: [],
              imageUrl: null,
              imageCached: false,
              audioCustom: null,
              createdAt: new Date(),
            };
            await wordRepo.create(word);

            await statsRepo.create({
              wordId: word.id,
              profileId: activeProfile.id,
              lastAsked: null,
              timesAsked: 0,
              timesWrong: 0,
              timesStruggledRight: 0,
              timesEasyRight: 0,
              consecutiveCorrect: 0,
              currentBucket: 'new',
              nextReviewDate: new Date(),
              difficultyScore: 0.5,
              techniqueHistory: [],
            });
          }
        }

        setEditingList(null);
      } else {
        // Create new list
        const list = await wordListRepo.create({
          profileId: activeProfile.id,
          name,
          testDate,
          createdAt: new Date(),
          source: 'manual',
          active: true,
          archived: false,
        });

        for (const wordText of words) {
          const word: Word = {
            id: uuidv4(),
            listId: list.id,
            profileId: activeProfile.id,
            text: wordText,
            phonemes: [],
            syllables: [],
            patterns: [],
            imageUrl: null,
            imageCached: false,
            audioCustom: null,
            createdAt: new Date(),
          };
          await wordRepo.create(word);

          const stats: WordStats = {
            id: uuidv4(),
            wordId: word.id,
            profileId: activeProfile.id,
            lastAsked: null,
            timesAsked: 0,
            timesWrong: 0,
            timesStruggledRight: 0,
            timesEasyRight: 0,
            consecutiveCorrect: 0,
            currentBucket: 'new',
            nextReviewDate: new Date(),
            difficultyScore: 0.5,
            techniqueHistory: [],
          };
          await statsRepo.create(stats);
        }
      }

      await refreshListData();
      setView('word-lists');
    },
    [activeProfile, editingList, refreshListData],
  );

  const handleDeleteList = useCallback(
    async (listId: string) => {
      await wordListRepo.delete(listId);
      await refreshListData();
    },
    [refreshListData],
  );

  const handleArchiveList = useCallback(
    async (listId: string) => {
      await wordListRepo.archive(listId);
      await refreshListData();
    },
    [refreshListData],
  );

  const handleUnarchiveList = useCallback(
    async (listId: string) => {
      await wordListRepo.unarchive(listId);
      await refreshListData();
    },
    [refreshListData],
  );

  const handleContrastModeChange = useCallback(
    async (mode: AccessibilitySettings['contrastMode']) => {
      if (!activeProfile) return;
      const newSettings = mergeSetting(activeProfile.settings, 'contrastMode', mode);
      applySettings(newSettings);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: { contrastMode: mode } } });
    },
    [activeProfile],
  );

  const handlePresetApply = useCallback(
    async (preset: NamedPreset) => {
      if (!activeProfile) return;
      // Keep the current contrast mode when applying a preset (unless preset specifies high-contrast)
      const newSettings = validateSettings({
        ...preset.settings,
        contrastMode: preset.settings.contrastMode !== 'light' ? preset.settings.contrastMode : activeProfile.settings.contrastMode,
      });
      applySettings(newSettings);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: newSettings } });
    },
    [activeProfile],
  );

  const handleFeedback = useCallback(async (text: string) => {
    await db.syncQueue.add({
      id: uuidv4(),
      type: 'feedback',
      payload: {
        text,
        deviceInfo: {
          userAgent: navigator.userAgent,
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          platform: navigator.platform,
        },
        appVersion: '0.1.0',
        createdAt: new Date(),
      },
      createdAt: new Date(),
      synced: false,
    });
  }, []);

  const handleExportProfile = useCallback(async () => {
    if (!activeProfile) return;
    const payload = await exportProfile(activeProfile.id);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spellforge-${activeProfile.name.toLowerCase().replace(/\s+/g, '-')}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeProfile]);

  const handleImportProfile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const strategy: ImportStrategy = 'merge';
      await importProfile(payload, strategy);
      // Reload current profile data
      if (activeProfile) {
        await selectProfile(activeProfile);
      }
    } catch {
      // Import failed silently — could add error reporting later
    }
  }, [activeProfile, selectProfile]);

  // Compute active list and days until test
  const activeList = wordLists.find((l) => l.active && !l.archived) ?? null;
  const [mountTime] = useState(Date.now);
  const daysUntilTest = activeList?.testDate
    ? Math.max(0, Math.ceil((activeList.testDate.getTime() - mountTime) / 86400000))
    : null;

  // Render views
  switch (view) {
    case 'loading':
      return (
        <div className="min-h-screen bg-sf-bg flex items-center justify-center">
          <p className="text-sf-text text-lg">Loading...</p>
        </div>
      );

    case 'onboarding':
      return <FirstRun onComplete={handleOnboardingComplete} />;

    case 'profile-select':
      return (
        <ProfileSelector
          profiles={profiles}
          onSelect={selectProfile}
          onAddProfile={() => setView('onboarding')}
        />
      );

    case 'practice':
      if (!activeProfile) return null;
      return (
        <PracticeScreen
          profile={activeProfile}
          activeList={activeList}
          allWords={allWords}
          allStats={allStats}
          daysUntilTest={daysUntilTest}
          streakCount={streakData?.currentStreak ?? 0}
          onSessionEnd={handleSessionEnd}
          onStatsUpdate={handleStatsUpdate}
          onBack={() => setView('home')}
          onSpeak={(word) => audioManager.speak(word)}
        />
      );

    case 'practice-games':
      if (!activeProfile) return null;
      return (
        <PracticeGames
          profile={activeProfile}
          activeList={activeList}
          allWords={allWords}
          onSessionEnd={handleSessionEnd}
          onBack={() => setView('home')}
          onSpeak={(word) => audioManager.speak(word)}
        />
      );

    case 'list-editor': {
      const editWords = editingList
        ? allWords.filter((w) => w.listId === editingList.id).map((w) => w.text)
        : [];
      return (
        <ListEditor
          list={editingList}
          existingWords={editWords}
          ocrManager={ocrManager}
          onSave={handleSaveList}
          onCancel={() => { setEditingList(null); setView('word-lists'); }}
        />
      );
    }

    case 'feedback':
      return (
        <FeedbackForm
          onSubmit={handleFeedback}
          onCancel={() => setView('home')}
        />
      );

    case 'progress':
      if (!activeProfile) return null;
      return (
        <div className="bg-sf-bg min-h-screen">
          <ProgressView
            streakData={streakData}
            allWords={allWords}
            allStats={allStats}
            activeList={activeList}
            daysUntilTest={daysUntilTest}
            onStartPractice={() => setView('practice')}
            onAddWords={() => setView('list-editor')}
            onBack={() => setView('home')}
          />
        </div>
      );

    case 'settings':
      if (!activeProfile) return null;
      return (
        <SettingsPanel
          profile={activeProfile}
          settings={activeProfile.settings}
          onContrastModeChange={handleContrastModeChange}
          onPresetApply={handlePresetApply}
          onExportProfile={handleExportProfile}
          onImportProfile={handleImportProfile}
          onBack={() => setView('home')}
        />
      );

    case 'word-lists':
      if (!activeProfile) return null;
      return (
        <WordListsView
          wordLists={wordLists}
          allWords={allWords}
          allStats={allStats}
          onAddList={() => { setEditingList(null); setView('list-editor'); }}
          onEditList={(list) => { setEditingList(list); setView('list-editor'); }}
          onDeleteList={handleDeleteList}
          onArchiveList={handleArchiveList}
          onUnarchiveList={handleUnarchiveList}
          onImportFromCamera={() => { setEditingList(null); setView('list-editor'); }}
          onBack={() => setView('home')}
        />
      );

    case 'home':
    default:
      if (!activeProfile) return null;
      return (
        <HomeScreen
          profile={activeProfile}
          wordLists={wordLists}
          allWords={allWords}
          allStats={allStats}
          streakData={streakData}
          onNavigate={(target) => setView(target)}
          onSwitchProfile={() => setView('profile-select')}
          hasMultipleProfiles={profiles.length > 1}
        />
      );
  }
}

export default App;
