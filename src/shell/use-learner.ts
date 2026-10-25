// src/shell/use-learner.ts: the open child and everything loaded for him (words, stats, lists, streak, coins, test
// results), and the actions that change it as he practises. The Shell's state, kept out of App.tsx.
import { useState, useEffect, useCallback, type MutableRefObject } from 'react';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  WordLearningProgress,
  SessionLog,
  StreakData,
  CoinBalance,
  TestResult,
} from '../contracts/types';
import { wordRepo } from '../data/repositories/word-repo';
import { statsRepo } from '../data/repositories/stats-repo';
import { wordListRepo } from '../data/repositories/word-list-repo';
import { sessionRepo } from '../data/repositories/session-repo';
import { streakRepo } from '../data/repositories/streak-repo';
import { learningProgressRepo } from '../data/repositories/learning-progress-repo';
import { testResultRepo } from '../data/repositories/test-result-repo';
import { earnCoinForMastery, spendCoinForGame, getCoinBalance, awardPendingMilestones } from '../core/spaced-rep';
import { applySettings, validateSettings } from '../accessibility/settings';
import { rewardTracker, monsterCollection } from '../features/rewards';
import { useOnPhotoImportSettled } from '../features/word-lists/photo-import';
import { themeEngine } from '../themes';
import { eventBus, setBusProfile } from './services';
import { landingView } from './landing';
import type { ViewId } from './worlds';

export function useLearner(setView: (view: ViewId) => void, landingRef: MutableRefObject<ViewId | null>) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [archivedProfiles, setArchivedProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [allStats, setAllStats] = useState<WordStats[]>([]);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [learningProgress, setLearningProgress] = useState<WordLearningProgress[]>([]);
  const [coinBalance, setCoinBalance] = useState<CoinBalance | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const selectProfile = useCallback(async (profile: Profile) => {
    const safeSettings = validateSettings(profile.settings ?? {});
    const safeProfile = { ...profile, settings: safeSettings };
    setActiveProfile(safeProfile);
    setBusProfile(safeProfile);
    applySettings(safeSettings);
    themeEngine.applyThemePalette(profile.themeId ?? 'dragon-forge');
    localStorage.setItem('sf-last-profile', profile.id);

    try {
      const [words, stats, lists, streak, lp, tr] = await Promise.all([
        wordRepo.getByProfileId(profile.id),
        statsRepo.getByProfileId(profile.id),
        wordListRepo.getByProfileId(profile.id),
        streakRepo.get(profile.id),
        learningProgressRepo.getByProfileId(profile.id),
        testResultRepo.getByProfileId(profile.id),
      ]);

      // Restore theme progress (creature growth, milestones) from IndexedDB
      await Promise.all([
        rewardTracker.hydrateProfile(profile.id),
        monsterCollection.hydrateProfile(profile.id),
      ]);

      setAllWords(words);
      setAllStats(stats);
      setWordLists(lists);
      setStreakData(streak);
      setLearningProgress(lp);
      setTestResults(tr);

      // Award any milestone coins that were earned but never recorded
      const activeLists = lists.filter((l) => l.active && !l.archived);
      const activeListIds = new Set(activeLists.map((l) => l.id));
      const activeWords = words.filter((w) => activeListIds.has(w.listId));
      const activeWordIds = new Set(activeWords.map((w) => w.id));
      const activeStats = stats.filter((s) => activeWordIds.has(s.wordId));
      const { balance: updatedCoins, awarded } = await awardPendingMilestones(profile.id, activeStats, activeWords.length);
      setCoinBalance(updatedCoins);
      for (const reason of awarded) {
        eventBus.emit({ type: 'coins:earned', payload: { profileId: profile.id, amount: 1, reason } });
      }
    } catch {
      // If loading profile data fails, proceed with empty data
    }

    // Where he lands: a share waiting for the tutor, or the screen he was on when he left, else the front door (Tutor on) or Home.
    setView(landingRef.current ?? landingView());
    landingRef.current = null;
    eventBus.emit({ type: 'profile:switched', payload: { profileId: profile.id } });
  }, [setView, landingRef]);

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
        const word = allWords.find((w) => w.id === updated.wordId);
        const newBalance = await earnCoinForMastery(activeProfile.id, updated.wordId, word?.text);
        setCoinBalance(newBalance);
        eventBus.emit({
          type: 'coins:earned',
          payload: { profileId: activeProfile.id, amount: 1, reason: 'word-mastered', wordId: updated.wordId },
        });
      }

      // Check for all-learning and all-familiar milestones
      const updatedStats = allStats.map((s) => (s.id === updated.id ? updated : s));
      const lists = wordLists.filter((l) => l.active && !l.archived);
      const listIds = new Set(lists.map((l) => l.id));
      const wordsInActiveLists = allWords.filter((w) => listIds.has(w.listId));
      const wordIds = new Set(wordsInActiveLists.map((w) => w.id));
      const statsForActive = updatedStats.filter((s) => wordIds.has(s.wordId));

      // Award milestone coins with persistent dedup (checks DB, not session refs)
      const { balance: milestoneBalance, awarded } = await awardPendingMilestones(
        activeProfile.id, statsForActive, wordsInActiveLists.length,
      );
      if (awarded.length > 0) {
        setCoinBalance(milestoneBalance);
        for (const reason of awarded) {
          eventBus.emit({ type: 'coins:earned', payload: { profileId: activeProfile.id, amount: 1, reason } });
        }
      }
    },
    [activeProfile, allStats, allWords, wordLists],
  );

  const refreshListData = useCallback(async () => {
    if (!activeProfile) return;
    const [updatedWords, updatedStats, updatedLists, updatedLp, updatedCoins, updatedTr] = await Promise.all([
      wordRepo.getByProfileId(activeProfile.id),
      statsRepo.getByProfileId(activeProfile.id),
      wordListRepo.getByProfileId(activeProfile.id),
      learningProgressRepo.getByProfileId(activeProfile.id),
      getCoinBalance(activeProfile.id),
      testResultRepo.getByProfileId(activeProfile.id),
    ]);
    setAllWords(updatedWords);
    setAllStats(updatedStats);
    setWordLists(updatedLists);
    setLearningProgress(updatedLp);
    setCoinBalance(updatedCoins);
    setTestResults(updatedTr);
  }, [activeProfile]);

  // Refresh data when the app regains focus (e.g. switching back from another
  // tab or resuming a PWA) so that changes made elsewhere are visible.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshListData();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshListData]);

  // A photo import that settles has landed its words: reload the lists so they show.
  useOnPhotoImportSettled(() => void refreshListData());

  // When a word completes learning mode, promote it to 'familiar' in spaced-rep
  const handleWordMasteredInLearning = useCallback(async (wordId: string) => {
    if (!activeProfile) return;

    // Initialize or promote the word's spaced-rep stats to 'familiar' bucket
    const existing = await statsRepo.getByWordId(wordId);
    if (existing) {
      // Only promote if the word hasn't already reached familiar or higher through practice
      if (existing.currentBucket === 'new' || existing.currentBucket === 'learning') {
        await statsRepo.update(existing.id, { currentBucket: 'familiar' });
      }
    } else {
      // Create initial stats at familiar bucket
      await statsRepo.create({
        wordId,
        profileId: activeProfile.id,
        lastAsked: null,
        timesAsked: 0,
        timesWrong: 0,
        timesStruggledRight: 0,
        timesEasyRight: 0,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        longestCorrectStreak: 0,
        currentBucket: 'familiar',
        nextReviewDate: new Date(),
        difficultyScore: 0.5,
        techniqueHistory: [],
      });
    }

    // Refresh stats in state so dashboard reflects the change
    const refreshedStats = await statsRepo.getByProfileId(activeProfile.id);
    setAllStats(refreshedStats);
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

  return {
    profiles, setProfiles, archivedProfiles, setArchivedProfiles, activeProfile, setActiveProfile,
    allWords, allStats, setAllStats, wordLists, streakData, learningProgress, coinBalance, testResults,
    selectProfile, handleSessionEnd, handleStatsUpdate, refreshListData, handleWordMasteredInLearning, handleSpendCoin,
  };
}

export type Learner = ReturnType<typeof useLearner>;
