// src/shell/use-lists.ts: the word lists, their words and the test results: which one a screen is on, and what saving,
// deleting, importing and recording do. The Shell's state, kept out of App.tsx.
import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { WordList, Word, WordStats, TestResult, TestWordResult } from '../contracts/types';
import { wordListRepo } from '../data/repositories/word-list-repo';
import { wordRepo } from '../data/repositories/word-repo';
import { statsRepo } from '../data/repositories/stats-repo';
import { testResultRepo } from '../data/repositories/test-result-repo';
import { computeTestDemotion } from '../core/spaced-rep';
import { addWordsToList } from '../features/word-lists/add-words';
import { forgetSettledPhotoImports } from '../features/word-lists/photo-import';
import type { QrWordListPayload } from '../features/word-lists/qr-codec';
import { eventBus } from './services';
import type { Learner } from './use-learner';
import type { ViewId } from './worlds';

/** A fresh word's stats: never asked, in the 'new' bucket. */
function newStats(profileId: string, wordId: string): Omit<WordStats, 'id'> {
  return {
    wordId,
    profileId,
    lastAsked: null,
    timesAsked: 0,
    timesWrong: 0,
    timesStruggledRight: 0,
    timesEasyRight: 0,
    consecutiveCorrect: 0,
    consecutiveWrong: 0,
    longestCorrectStreak: 0,
    currentBucket: 'new',
    nextReviewDate: new Date(),
    difficultyScore: 0.5,
    techniqueHistory: [],
  };
}

function newWord(profileId: string, listId: string, text: string): Word {
  return {
    id: uuidv4(),
    listId,
    profileId,
    text,
    phonemes: [],
    syllables: [],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    createdAt: new Date(),
  };
}

export function useLists(learner: Learner, setView: (view: ViewId) => void) {
  const { activeProfile, allStats, refreshListData } = learner;
  const [editingList, setEditingList] = useState<WordList | null>(null);
  const [viewingList, setViewingList] = useState<WordList | null>(null);
  const [viewingTestResult, setViewingTestResult] = useState<TestResult | null>(null);
  const [practiceWordFilter, setPracticeWordFilter] = useState<Set<string> | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

  const handleSaveList = useCallback(
    async (name: string, words: string[], testDate: Date | null, _source?: string, language?: string) => {
      if (!activeProfile) return;

      if (editingList) {
        // Update existing list metadata (include language if provided)
        await wordListRepo.update(editingList.id, { name, testDate, ...(language ? { language } : {}) });

        // Diff words: remove deleted, add new, keep existing
        const existingWords = await wordRepo.getByListId(editingList.id);
        const newTexts = new Set(words);

        // Delete words that were removed
        for (const existing of existingWords) {
          if (!newTexts.has(existing.text)) {
            await wordRepo.delete(existing.id);
          }
        }

        // Add words that are new
        await addWordsToList({ listId: editingList.id, profileId: activeProfile.id, words });
        // Saving ends a photo import's 'Read on this device' note.
        await forgetSettledPhotoImports(editingList.id);

        setEditingList(null);
      } else {
        // Create new list
        const list = await wordListRepo.create({
          profileId: activeProfile.id,
          name,
          language: language ?? 'en',
          testDate,
          createdAt: new Date(),
          source: 'manual',
          active: true,
          archived: false,
        });

        await addWordsToList({ listId: list.id, profileId: activeProfile.id, words });
      }

      await refreshListData();
      setView('word-lists');
    },
    [activeProfile, editingList, refreshListData, setView],
  );

  // The editor's first photo for a new list: the list is saved with no words, and the editor goes on editing it.
  const handleCreatePhotoList = useCallback(
    async (name: string, testDate: Date | null, language: string): Promise<WordList> => {
      if (!activeProfile) throw new Error('No profile is open.');
      const list = await wordListRepo.create({
        profileId: activeProfile.id,
        name,
        language,
        testDate,
        createdAt: new Date(),
        source: 'camera',
        active: true,
        archived: false,
      });
      setEditingList(list);
      await refreshListData();
      return list;
    },
    [activeProfile, refreshListData],
  );

  const handleDeleteList = useCallback(
    async (listId: string) => {
      await wordListRepo.delete(listId);
      await refreshListData();
    },
    [refreshListData],
  );

  const handleQrImport = useCallback(
    async (payload: QrWordListPayload) => {
      if (!activeProfile) return;

      // Check for an existing list with the same name to prevent duplicates
      const existingLists = await wordListRepo.getByProfileId(activeProfile.id);
      const duplicate = existingLists.find(
        (l) => !l.archived && l.name.trim().toLowerCase() === payload.n.trim().toLowerCase(),
      );

      if (duplicate) {
        // List already exists — just make sure it's active and navigate to it
        if (!duplicate.active) {
          await wordListRepo.update(duplicate.id, { active: true });
        }
        await refreshListData();
        setView('word-lists');
        return;
      }

      const testDate = payload.t ? new Date(payload.t) : null;
      const list = await wordListRepo.create({
        profileId: activeProfile.id,
        name: payload.n,
        language: 'en',
        testDate,
        createdAt: new Date(),
        source: 'import',
        active: true,
        archived: false,
      });

      for (const wordText of payload.w) {
        const word = newWord(activeProfile.id, list.id, wordText);
        await wordRepo.create(word);
        await statsRepo.create(newStats(activeProfile.id, word.id));
      }

      await refreshListData();
      setView('word-lists');
    },
    [activeProfile, refreshListData, setView],
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

  const handleSaveTestResults = useCallback(
    async (wordResults: TestWordResult[], overridePercent: number | null) => {
      if (!activeProfile || !viewingList) return;
      const correctCount = wordResults.filter((w) => w.correct).length;
      const calculatedPercent = wordResults.length > 0
        ? Math.round((correctCount / wordResults.length) * 100)
        : 0;
      const finalPercent = overridePercent ?? calculatedPercent;

      const testResult = await testResultRepo.create({
        wordListId: viewingList.id,
        profileId: activeProfile.id,
        testDate: viewingList.testDate ?? new Date(),
        recordedAt: new Date(),
        wordResults,
        calculatedPercent,
        overridePercent,
        finalPercent,
      });

      // Demote words that were wrong on the test
      const wrongWordIds = wordResults.filter((w) => !w.correct).map((w) => w.wordId);
      for (const wordId of wrongWordIds) {
        const stats = allStats.find((s) => s.wordId === wordId);
        if (stats) {
          const demotion = computeTestDemotion(stats);
          if (demotion) {
            await statsRepo.update(stats.id, demotion);
          }
        }
      }

      eventBus.emit({ type: 'test:recorded', payload: { testResult, wordListId: viewingList.id } });
      await refreshListData();

      // Prompt to archive if past test date
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const testDateNorm = viewingList.testDate ? new Date(viewingList.testDate) : null;
      if (testDateNorm) testDateNorm.setHours(0, 0, 0, 0);
      if (testDateNorm && testDateNorm.getTime() < now.getTime()) {
        // Archive the list automatically after recording results past test date
        await wordListRepo.archive(viewingList.id);
        await refreshListData();
      }

      setViewingTestResult(testResult);
      setView('test-result-detail');
    },
    [activeProfile, viewingList, allStats, refreshListData, setView],
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
      const word = newWord(activeProfile.id, viewingList.id, text);
      await wordRepo.create(word);
      await statsRepo.create(newStats(activeProfile.id, word.id));
      await refreshListData();
    },
    [activeProfile, viewingList, refreshListData],
  );

  return {
    editingList, setEditingList, viewingList, setViewingList, viewingTestResult, setViewingTestResult,
    practiceWordFilter, setPracticeWordFilter, selectedWordId, setSelectedWordId,
    handleSaveList, handleCreatePhotoList, handleDeleteList, handleQrImport, handleArchiveList, handleUnarchiveList,
    handleSaveTestResults, handleUpdateWord, handleDeleteWord, handleAddWordToList,
  };
}

export type Lists = ReturnType<typeof useLists>;
