// src/App.tsx — Root component: routing, state management, event bus wiring

import { useState, useEffect, useCallback } from 'react';
import { useBackButton } from './hooks/use-back-button';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  WordLearningProgress,
  SessionLog,
  StreakData,
  AccessibilitySettings,
  ImportStrategy,
  CoinBalance,
} from './contracts/types';
import { createEventBus } from './contracts/events';
import { db, openDatabase } from './data/db';
import { profileRepo } from './data/repositories/profile-repo';
import { wordListRepo } from './data/repositories/word-list-repo';
import { wordRepo } from './data/repositories/word-repo';
import { statsRepo } from './data/repositories/stats-repo';
import { sessionRepo } from './data/repositories/session-repo';
import { streakRepo } from './data/repositories/streak-repo';
import { learningProgressRepo } from './data/repositories/learning-progress-repo';
import { earnCoinForMastery, spendCoinForGame, canPlayFree, getCoinBalance } from './core/spaced-rep';
import { applySettings, mergeSetting, validateSettings } from './accessibility/settings';
import { ProfileSelector } from './features/profiles/profile-selector';
import { FirstRun } from './features/onboarding/first-run';
import { HomeScreen } from './features/dashboard/home-screen';
import { ProgressView } from './features/dashboard/progress-view';
import { PracticeScreen } from './features/practice/practice-screen';
import { PracticeGames } from './features/practice/practice-games';
import { QuizScreen } from './features/practice/quiz-screen';
import { LearningScreen } from './features/learning';
import { ListEditor } from './features/word-lists/list-editor';
import { WordListsView } from './features/word-lists/word-lists-view';
import { WordListDetail } from './features/word-lists/word-list-detail';
import { FeedbackForm } from './features/feedback/feedback-form';
import { SettingsPanel } from './features/settings/settings-panel';
import { SharePanel } from './features/settings/share-panel';
import { AudioManagerImpl, TtsProvider, DictionaryProvider } from './audio';
import { createOcrManager } from './ocr';
import { rewardTracker, monsterCollection } from './features/rewards';
import { MonsterStable } from './features/rewards/monster-stable';
import { themeEngine } from './themes';
import { exportProfile, importProfile } from './data/import-export';
import { countMasteredWords } from './core/mastery';
import type { NamedPreset } from './accessibility/presets';
import { v4 as uuidv4 } from 'uuid';

type AppView = 'loading' | 'db-blocked' | 'onboarding' | 'profile-select' | 'home' | 'progress' | 'practice' | 'practice-games' | 'quiz' | 'learning' | 'list-editor' | 'word-lists' | 'word-list-detail' | 'settings' | 'feedback' | 'share' | 'monster-stable';

const eventBus = createEventBus();

// Wire reward tracker to the event bus so it auto-tracks rewards from events
let activeProfileForBus: Profile | null = null;

eventBus.on('session:ended', (event) => {
  if (!activeProfileForBus || event.type !== 'session:ended') return;
  const reward = rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
  eventBus.emit({ type: 'reward:earned', payload: reward });
});

eventBus.on('streak:updated', (event) => {
  if (!activeProfileForBus || event.type !== 'streak:updated') return;
  rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
});

eventBus.on('word:attempted', (event) => {
  if (!activeProfileForBus || event.type !== 'word:attempted') return;
  rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
});

const audioManager = new AudioManagerImpl();
audioManager.registerProvider(new TtsProvider());
audioManager.registerProvider(new DictionaryProvider());

const ocrManager = createOcrManager();

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [allStats, setAllStats] = useState<WordStats[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [learningProgress, setLearningProgress] = useState<WordLearningProgress[]>([]);
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [viewingList, setViewingList] = useState<WordList | null>(null);
  const [coinBalance, setCoinBalance] = useState<CoinBalance | null>(null);

  // Sync view state with browser history so the OS back button
  // navigates within the app instead of closing it.
  useBackButton(view, setView, 'home', ['loading', 'db-blocked']);

  const selectProfile = useCallback(async (profile: Profile) => {
    setActiveProfile(profile);
    activeProfileForBus = profile;
    applySettings(profile.settings);
    audioManager.setVoicePreference(profile.settings.voicePreference);
    themeEngine.applyThemePalette(profile.themeId);
    localStorage.setItem('sf-last-profile', profile.id);

    try {
      const [words, stats, lists, streak, lp, coins] = await Promise.all([
        wordRepo.getByProfileId(profile.id),
        statsRepo.getByProfileId(profile.id),
        wordListRepo.getByProfileId(profile.id),
        streakRepo.get(profile.id),
        learningProgressRepo.getByProfileId(profile.id),
        getCoinBalance(profile.id),
      ]);

      setAllWords(words);
      setAllStats(stats);
      setWordLists(lists);
      setStreakData(streak);
      setLearningProgress(lp);
      setCoinBalance(coins);
    } catch {
      // If loading profile data fails, proceed with empty data
    }

    setView('home');
    eventBus.emit({ type: 'profile:switched', payload: { profileId: profile.id } });
  }, []);

  // Load initial data: explicitly open DB first, then load profiles
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Step 1: Explicitly open the database, handling the blocked event
      try {
        await openDatabase(() => {
          // Another tab holds an older DB version open — show a helpful message
          if (!cancelled) setView('db-blocked');
        });
      } catch {
        if (!cancelled) {
          // DB failed to open (e.g. corrupted, permissions) — fall back to onboarding
          setView('onboarding');
        }
        return;
      }

      if (cancelled) return;

      // Step 2: DB is open — load profiles
      try {
        const profs = await profileRepo.getAll();
        if (cancelled) return;
        setProfiles(profs);

        if (profs.length === 0) {
          setView('onboarding');
        } else if (profs.length === 1) {
          await selectProfile(profs[0]);
        } else {
          // Try to restore the last-used profile
          const lastId = localStorage.getItem('sf-last-profile');
          const lastProfile = lastId ? profs.find((p) => p.id === lastId) : null;
          if (lastProfile) {
            await selectProfile(lastProfile);
          } else {
            setView('profile-select');
          }
        }
      } catch {
        if (!cancelled) {
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
    },
    [activeProfile],
  );

  const handleStatsUpdate = useCallback(
    async (updated: WordStats) => {
      if (!activeProfile) return;
      // Check if word just transitioned to mastered
      const previous = allStats.find((s) => s.id === updated.id);
      const justMastered = updated.currentBucket === 'mastered'
        && previous?.currentBucket !== 'mastered'
        && previous?.currentBucket !== 'review';

      await statsRepo.update(updated.id, updated);
      setAllStats((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );

      // Emit word:attempted so the reward tracker can grant per-word progress
      const lastTechnique = updated.techniqueHistory.length > 0
        ? updated.techniqueHistory[updated.techniqueHistory.length - 1]
        : null;
      eventBus.emit({
        type: 'word:attempted',
        payload: {
          wordId: updated.wordId,
          correct: updated.consecutiveCorrect > 0,
          technique: lastTechnique?.techniqueId ?? 'letter-bank',
          responseTimeMs: lastTechnique?.responseTimeMs ?? 0,
          struggled: lastTechnique?.struggled ?? false,
        },
      });

      // Award a coin for mastering a word
      if (justMastered) {
        const newBalance = await earnCoinForMastery(activeProfile.id);
        setCoinBalance(newBalance);
        eventBus.emit({
          type: 'coins:earned',
          payload: { profileId: activeProfile.id, amount: 1, reason: 'word-mastered', wordId: updated.wordId },
        });
      }
    },
    [activeProfile, allStats],
  );

  const refreshListData = useCallback(async () => {
    if (!activeProfile) return;
    const [updatedWords, updatedStats, updatedLists, updatedLp, updatedCoins] = await Promise.all([
      wordRepo.getByProfileId(activeProfile.id),
      statsRepo.getByProfileId(activeProfile.id),
      wordListRepo.getByProfileId(activeProfile.id),
      learningProgressRepo.getByProfileId(activeProfile.id),
      getCoinBalance(activeProfile.id),
    ]);
    setAllWords(updatedWords);
    setAllStats(updatedStats);
    setWordLists(updatedLists);
    setLearningProgress(updatedLp);
    setCoinBalance(updatedCoins);
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

  const handleUpdateWord = useCallback(
    async (wordId: string, newText: string) => {
      await wordRepo.update(wordId, { text: newText });
      await refreshListData();
    },
    [refreshListData],
  );

  const handleDeleteWord = useCallback(
    async (wordId: string) => {
      await wordRepo.delete(wordId);
      await refreshListData();
    },
    [refreshListData],
  );

  const handleAddWordToList = useCallback(
    async (text: string) => {
      if (!activeProfile || !viewingList) return;
      const word: Word = {
        id: uuidv4(),
        listId: viewingList.id,
        profileId: activeProfile.id,
        text,
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
      await refreshListData();
    },
    [activeProfile, viewingList, refreshListData],
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

  const handleVoicePreferenceChange = useCallback(
    async (voice: AccessibilitySettings['voicePreference']) => {
      if (!activeProfile) return;
      const newSettings = mergeSetting(activeProfile.settings, 'voicePreference', voice);
      applySettings(newSettings);
      audioManager.setVoicePreference(voice);
      const updated = { ...activeProfile, settings: newSettings };
      await profileRepo.update(updated.id, { settings: newSettings });
      setActiveProfile(updated);
      eventBus.emit({ type: 'settings:changed', payload: { profileId: updated.id, settings: { voicePreference: voice } } });
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

  const handleImportFilterWordsChange = useCallback(
    async (phrases: string[]) => {
      if (!activeProfile) return;
      const updated = { ...activeProfile, importFilterWords: phrases };
      await profileRepo.update(updated.id, { importFilterWords: phrases });
      setActiveProfile(updated);
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

  // Award coin when a word is mastered in learning mode
  const handleWordMasteredInLearning = useCallback(async (wordId: string) => {
    if (!activeProfile) return;
    const newBalance = await earnCoinForMastery(activeProfile.id);
    setCoinBalance(newBalance);
    eventBus.emit({
      type: 'coins:earned',
      payload: { profileId: activeProfile.id, amount: 1, reason: 'word-mastered', wordId },
    });
  }, [activeProfile]);

  // Coin spending for game access
  const handleSpendCoin = useCallback(async (): Promise<boolean> => {
    if (!activeProfile) return false;
    const result = await spendCoinForGame(activeProfile.id);
    if (result) {
      setCoinBalance(result);
      eventBus.emit({
        type: 'coins:spent',
        payload: { profileId: activeProfile.id, amount: 1, reason: 'game-play' },
      });
      return true;
    }
    return false;
  }, [activeProfile]);

  // Compute mastered count for coin economy
  const masteredCount = countMasteredWords(allWords, allStats, learningProgress);
  const allMastered = canPlayFree(allWords.length, masteredCount);

  // Compute active lists and days until nearest test
  const activeLists = wordLists.filter((l) => l.active && !l.archived);
  const activeList = activeLists[0] ?? null;
  const [mountTime] = useState(Date.now);
  const nearestTestDate = activeLists
    .map((l) => l.testDate)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const daysUntilTest = nearestTestDate
    ? Math.max(0, Math.ceil((nearestTestDate.getTime() - mountTime) / 86400000))
    : null;

  // Render views
  switch (view) {
    case 'loading':
      return (
        <div className="min-h-screen bg-sf-bg flex items-center justify-center">
          <p className="text-sf-text text-lg">Loading...</p>
        </div>
      );

    case 'db-blocked':
      return (
        <div className="min-h-screen bg-sf-bg flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <p className="text-sf-text text-lg font-bold mb-2">Waiting for other tabs</p>
            <p className="text-sf-text text-sm mb-4">
              SpellForge is open in another tab. Please close it there, then tap the button below.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-sf-primary text-white rounded-lg font-semibold"
            >
              Retry
            </button>
          </div>
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
          onSpeak={(word) => audioManager.speakTts(word)}
        />
      );

    case 'practice-games':
      if (!activeProfile) return null;
      return (
        <PracticeGames
          profile={activeProfile}
          activeList={activeList}
          allWords={allWords}
          coinBalance={coinBalance}
          allMastered={allMastered}
          onSpendCoin={handleSpendCoin}
          onSessionEnd={handleSessionEnd}
          onBack={() => setView('home')}
          onSpeak={(word) => audioManager.speakTts(word)}
        />
      );

    case 'quiz':
      if (!activeProfile) return null;
      return (
        <QuizScreen
          profile={activeProfile}
          activeList={activeList}
          allWords={allWords}
          onSessionEnd={handleSessionEnd}
          onBack={() => setView('home')}
          onSpeak={(word) => audioManager.speakTts(word)}
        />
      );

    case 'learning':
      if (!activeProfile) return null;
      return (
        <LearningScreen
          profile={activeProfile}
          audioManager={audioManager}
          onBack={() => { refreshListData(); setView('home'); }}
          onWordMastered={handleWordMasteredInLearning}
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
          importFilterPhrases={activeProfile?.importFilterWords}
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
            profileId={activeProfile.id}
            themeId={activeProfile.themeId}
            streakData={streakData}
            allWords={allWords}
            allStats={allStats}
            learningProgress={learningProgress}
            activeLists={activeLists}
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
          importFilterWords={activeProfile.importFilterWords}
          onImportFilterWordsChange={handleImportFilterWordsChange}
          onContrastModeChange={handleContrastModeChange}
          onVoicePreferenceChange={handleVoicePreferenceChange}
          onPresetApply={handlePresetApply}
          onExportProfile={handleExportProfile}
          onImportProfile={handleImportProfile}
          onShare={() => setView('share')}
          onSendFeedback={() => setView('feedback')}
          onBack={() => setView('home')}
        />
      );

    case 'share':
      return <SharePanel onBack={() => setView('home')} />;

    case 'word-list-detail':
      if (!activeProfile || !viewingList) return null;
      return (
        <WordListDetail
          list={viewingList}
          words={allWords.filter((w) => w.listId === viewingList.id)}
          stats={allStats.filter((s) => allWords.some((w) => w.listId === viewingList.id && w.id === s.wordId))}
          learningProgress={learningProgress.filter((lp) => lp.wordListId === viewingList.id)}
          onUpdateWord={handleUpdateWord}
          onDeleteWord={handleDeleteWord}
          onAddWord={handleAddWordToList}
          onBack={() => { setViewingList(null); setView('word-lists'); }}
          onEditList={(list) => { setEditingList(list); setView('list-editor'); }}
        />
      );

    case 'word-lists':
      if (!activeProfile) return null;
      return (
        <WordListsView
          wordLists={wordLists}
          allWords={allWords}
          allStats={allStats}
          learningProgress={learningProgress}
          onAddList={() => { setEditingList(null); setView('list-editor'); }}
          onViewList={(list) => { setViewingList(list); setView('word-list-detail'); }}
          onEditList={(list) => { setEditingList(list); setView('list-editor'); }}
          onDeleteList={handleDeleteList}
          onArchiveList={handleArchiveList}
          onUnarchiveList={handleUnarchiveList}
          onImportFromCamera={() => { setEditingList(null); setView('list-editor'); }}
          onBack={() => setView('home')}
        />
      );

    case 'monster-stable':
      if (!activeProfile) return null;
      return (
        <MonsterStable
          profile={activeProfile}
          collection={monsterCollection.getCollection(activeProfile.id)}
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
          learningProgress={learningProgress}
          streakData={streakData}
          coinBalance={coinBalance}
          onNavigate={(target) => setView(target)}
          onSwitchProfile={() => setView('profile-select')}
          hasMultipleProfiles={profiles.length > 1}
        />
      );
  }
}

export default App;
