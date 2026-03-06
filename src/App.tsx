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
} from './contracts/types';
import { createEventBus } from './contracts/events';
import { db } from './data/db';
import { profileRepo } from './data/repositories/profile-repo';
import { wordListRepo } from './data/repositories/word-list-repo';
import { wordRepo } from './data/repositories/word-repo';
import { statsRepo } from './data/repositories/stats-repo';
import { sessionRepo } from './data/repositories/session-repo';
import { streakRepo } from './data/repositories/streak-repo';
import { applySettings, mergeSetting } from './accessibility/settings';
import { ProfileSelector } from './features/profiles/profile-selector';
import { FirstRun } from './features/onboarding/first-run';
import { ProgressView } from './features/dashboard/progress-view';
import { PracticeScreen } from './features/practice/practice-screen';
import { ListEditor } from './features/word-lists/list-editor';
import { FeedbackForm } from './features/feedback/feedback-form';
import { ThemeToggle } from './features/settings/theme-toggle';
import { AudioManagerImpl, TtsProvider } from './audio';
import { v4 as uuidv4 } from 'uuid';

type AppView = 'loading' | 'onboarding' | 'profile-select' | 'home' | 'practice' | 'list-editor' | 'feedback';

const eventBus = createEventBus();

const audioManager = new AudioManagerImpl();
audioManager.registerProvider(new TtsProvider());

function App() {
  const [view, setView] = useState<AppView>('loading');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [allStats, setAllStats] = useState<WordStats[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);

  const selectProfile = useCallback(async (profile: Profile) => {
    setActiveProfile(profile);
    applySettings(profile.settings);

    const words = await wordRepo.getByProfileId(profile.id);
    const stats = await statsRepo.getByProfileId(profile.id);
    const lists = await wordListRepo.getByProfileId(profile.id);
    const streak = await streakRepo.get(profile.id);

    setAllWords(words);
    setAllStats(stats);
    setWordLists(lists);
    setStreakData(streak);
    setView('home');

    eventBus.emit({ type: 'profile:switched', payload: { profileId: profile.id } });
  }, []);

  // Load initial data
  useEffect(() => {
    async function load() {
      const profs = await profileRepo.getAll();
      setProfiles(profs);

      if (profs.length === 0) {
        setView('onboarding');
      } else if (profs.length === 1) {
        await selectProfile(profs[0]);
      } else {
        setView('profile-select');
      }
    }
    load();
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

  const handleSaveList = useCallback(
    async (name: string, words: string[], testDate: Date | null) => {
      if (!activeProfile) return;

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

      // Refresh data
      const updatedWords = await wordRepo.getByProfileId(activeProfile.id);
      const updatedStats = await statsRepo.getByProfileId(activeProfile.id);
      const updatedLists = await wordListRepo.getByProfileId(activeProfile.id);
      setAllWords(updatedWords);
      setAllStats(updatedStats);
      setWordLists(updatedLists);
      setView('home');
    },
    [activeProfile],
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
          onBack={() => setView('home')}
          onSpeak={(word) => audioManager.speak(word)}
        />
      );

    case 'list-editor':
      return (
        <ListEditor
          existingWords={[]}
          onSave={handleSaveList}
          onCancel={() => setView('home')}
        />
      );

    case 'feedback':
      return (
        <FeedbackForm
          onSubmit={handleFeedback}
          onCancel={() => setView('home')}
        />
      );

    case 'home':
    default:
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
            onBack={() => setView(profiles.length > 1 ? 'profile-select' : 'home')}
          />

          {/* Theme toggle + bottom actions */}
          <div className="max-w-lg mx-auto px-4 pb-4 space-y-3">
            <div className="flex justify-center">
              <ThemeToggle
                current={activeProfile.settings.contrastMode}
                onChange={handleContrastModeChange}
              />
            </div>
            <button
              onClick={() => setView('feedback')}
              className="w-full bg-sf-surface border border-sf-border hover:bg-sf-surface-hover text-sf-muted py-2 rounded-lg text-sm transition-colors"
            >
              Send Feedback
            </button>
          </div>
        </div>
      );
  }
}

export default App;
