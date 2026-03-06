// src/core/word-selection/selector.ts — Session word mix algorithm

import type {
  Word,
  WordList,
  WordStats,
  SessionWordSelection,
} from '../../contracts/types';

/**
 * Default session mix ratios.
 */
const DEFAULT_CURRENT_RATIO = 0.6;
const DEFAULT_REVIEW_RATIO = 0.3;
const DEFAULT_MAINTENANCE_RATIO = 0.1;

/**
 * Difficulty threshold above which a word is considered a "trouble word".
 */
const TROUBLE_THRESHOLD = 0.7;

/**
 * Select words for a practice session.
 *
 * @param activeList - The current active word list (or null if none)
 * @param allWords - All words across all lists for this profile
 * @param allStats - Stats for all words
 * @param sessionSize - Target number of words for the session
 * @param daysUntilTest - Days until test (null if no test date)
 * @returns SessionWordSelection with categorized word arrays
 */
export function selectSessionWords(
  activeList: WordList | null,
  allWords: Word[],
  allStats: WordStats[],
  sessionSize: number,
  daysUntilTest: number | null,
): SessionWordSelection {
  if (sessionSize <= 0 || allWords.length === 0) {
    return {
      currentListWords: [],
      reviewWords: [],
      maintenanceWords: [],
      totalTarget: sessionSize,
    };
  }

  const statsMap = new Map<string, WordStats>();
  for (const s of allStats) {
    statsMap.set(s.wordId, s);
  }

  // Separate words into categories
  const currentListWordIds = activeList
    ? new Set(allWords.filter(w => w.listId === activeList.id).map(w => w.id))
    : new Set<string>();

  const currentWords = allWords.filter(w => currentListWordIds.has(w.id));
  const pastWords = allWords.filter(w => !currentListWordIds.has(w.id));

  // No active list: 100% review/maintenance
  if (!activeList || currentWords.length === 0) {
    const sorted = sortByPriority(pastWords, statsMap);
    const selected = sorted.slice(0, sessionSize);

    // Split past words into review vs maintenance based on bucket
    const reviewWords: Word[] = [];
    const maintenanceWords: Word[] = [];
    for (const w of selected) {
      const st = statsMap.get(w.id);
      if (st && (st.currentBucket === 'mastered' || st.currentBucket === 'review')) {
        maintenanceWords.push(w);
      } else {
        reviewWords.push(w);
      }
    }

    return {
      currentListWords: [],
      reviewWords,
      maintenanceWords,
      totalTarget: sessionSize,
    };
  }

  // Calculate ratios based on test proximity
  const { currentRatio, reviewRatio } =
    computeRatios(daysUntilTest);

  // Calculate target counts
  let currentTarget = Math.round(sessionSize * currentRatio);
  let reviewTarget = Math.round(sessionSize * reviewRatio);
  let maintenanceTarget = Math.max(0, sessionSize - currentTarget - reviewTarget);

  // Identify trouble words (always included regardless of source)
  const troubleWords = allWords.filter(w => {
    const st = statsMap.get(w.id);
    return st && st.difficultyScore > TROUBLE_THRESHOLD;
  });

  // Sort current list words by priority (unmastered first, trouble words first)
  const sortedCurrent = sortByPriority(currentWords, statsMap);
  const sortedPast = sortByPriority(pastWords, statsMap);

  // Select current list words
  const selectedCurrent = sortedCurrent.slice(0, currentTarget);

  // Fill review from past lists (non-mastered/review bucket)
  const reviewCandidates = sortedPast.filter(w => {
    const st = statsMap.get(w.id);
    return !st || st.currentBucket !== 'mastered' && st.currentBucket !== 'review';
  });
  const maintenanceCandidates = sortedPast.filter(w => {
    const st = statsMap.get(w.id);
    return st && (st.currentBucket === 'mastered' || st.currentBucket === 'review');
  });

  let selectedReview = reviewCandidates.slice(0, reviewTarget);
  let selectedMaintenance = maintenanceCandidates.slice(0, maintenanceTarget);

  // Ensure trouble words are included
  const selectedIds = new Set([
    ...selectedCurrent.map(w => w.id),
    ...selectedReview.map(w => w.id),
    ...selectedMaintenance.map(w => w.id),
  ]);

  for (const tw of troubleWords) {
    if (!selectedIds.has(tw.id)) {
      // Add trouble word to the appropriate category
      if (currentListWordIds.has(tw.id)) {
        selectedCurrent.push(tw);
      } else {
        selectedReview.push(tw);
      }
      selectedIds.add(tw.id);
    }
  }

  // If we have excess from trouble word additions, trim from maintenance first, then review
  const total = selectedCurrent.length + selectedReview.length + selectedMaintenance.length;
  if (total > sessionSize) {
    const excess = total - sessionSize;
    // Trim maintenance first
    const maintenanceTrim = Math.min(excess, selectedMaintenance.length);
    selectedMaintenance = selectedMaintenance.slice(0, selectedMaintenance.length - maintenanceTrim);
    const remaining = excess - maintenanceTrim;
    if (remaining > 0) {
      // Trim review (but not trouble words)
      selectedReview = selectedReview.slice(0, Math.max(0, selectedReview.length - remaining));
    }
  }

  // If we don't have enough words in one category, fill from others
  const actualTotal = selectedCurrent.length + selectedReview.length + selectedMaintenance.length;
  if (actualTotal < sessionSize) {
    const deficit = sessionSize - actualTotal;
    // Try to fill from current list first
    const moreCurrent = sortedCurrent
      .filter(w => !selectedIds.has(w.id))
      .slice(0, deficit);
    for (const w of moreCurrent) {
      selectedCurrent.push(w);
      selectedIds.add(w.id);
    }

    const stillNeeded = sessionSize - selectedCurrent.length - selectedReview.length - selectedMaintenance.length;
    if (stillNeeded > 0) {
      const morePast = sortedPast
        .filter(w => !selectedIds.has(w.id))
        .slice(0, stillNeeded);
      for (const w of morePast) {
        selectedReview.push(w);
        selectedIds.add(w.id);
      }
    }
  }

  return {
    currentListWords: selectedCurrent,
    reviewWords: selectedReview,
    maintenanceWords: selectedMaintenance,
    totalTarget: sessionSize,
  };
}

/**
 * Compute session mix ratios based on test proximity.
 * As test date approaches, current list gets higher priority.
 */
function computeRatios(daysUntilTest: number | null): {
  currentRatio: number;
  reviewRatio: number;
  maintenanceRatio: number;
} {
  if (daysUntilTest === null) {
    return {
      currentRatio: DEFAULT_CURRENT_RATIO,
      reviewRatio: DEFAULT_REVIEW_RATIO,
      maintenanceRatio: DEFAULT_MAINTENANCE_RATIO,
    };
  }

  if (daysUntilTest <= 1) {
    // Day before test or test day: almost entirely current list
    return {
      currentRatio: 0.9,
      reviewRatio: 0.1,
      maintenanceRatio: 0.0,
    };
  }

  if (daysUntilTest <= 3) {
    // 2-3 days before test
    return {
      currentRatio: 0.8,
      reviewRatio: 0.15,
      maintenanceRatio: 0.05,
    };
  }

  if (daysUntilTest <= 5) {
    // 4-5 days before test
    return {
      currentRatio: 0.7,
      reviewRatio: 0.2,
      maintenanceRatio: 0.1,
    };
  }

  // More than 5 days: default ratios
  return {
    currentRatio: DEFAULT_CURRENT_RATIO,
    reviewRatio: DEFAULT_REVIEW_RATIO,
    maintenanceRatio: DEFAULT_MAINTENANCE_RATIO,
  };
}

/**
 * Sort words by review priority (higher priority first).
 * Priority considers: bucket (new/learning > familiar > mastered > review),
 * difficulty score, and whether review is overdue.
 */
function sortByPriority(words: Word[], statsMap: Map<string, WordStats>): Word[] {
  const bucketPriority: Record<string, number> = {
    new: 5,
    learning: 4,
    familiar: 3,
    mastered: 2,
    review: 1,
  };

  return [...words].sort((a, b) => {
    const sa = statsMap.get(a.id);
    const sb = statsMap.get(b.id);

    // Words without stats go first (new words)
    if (!sa && sb) return -1;
    if (sa && !sb) return 1;
    if (!sa && !sb) return 0;

    const statsA = sa!;
    const statsB = sb!;

    // Trouble words first
    const aTrouble = statsA.difficultyScore > TROUBLE_THRESHOLD ? 1 : 0;
    const bTrouble = statsB.difficultyScore > TROUBLE_THRESHOLD ? 1 : 0;
    if (aTrouble !== bTrouble) return bTrouble - aTrouble;

    // Then by bucket priority
    const aBucket = bucketPriority[statsA.currentBucket] ?? 0;
    const bBucket = bucketPriority[statsB.currentBucket] ?? 0;
    if (aBucket !== bBucket) return bBucket - aBucket;

    // Then by difficulty (harder words first)
    return statsB.difficultyScore - statsA.difficultyScore;
  });
}
