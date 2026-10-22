// src/shell/derive.ts: what the screens show of the lists: the active lists, their words and stats, how many are
// mastered, and the days to the nearest test. Archived lists do not count.
import type { WordList, Word, WordStats } from '../contracts/types';
import { canPlayFree } from '../core/spaced-rep';
import { countMasteredWords } from '../core/mastery';

export function deriveActive(wordLists: WordList[], allWords: Word[], allStats: WordStats[], now: number) {
  // Compute active lists and filter out archived words from counts
  const activeLists = wordLists.filter((l) => l.active && !l.archived);
  const activeListIds = new Set(activeLists.map((l) => l.id));
  const activeWords = allWords.filter((w) => activeListIds.has(w.listId));
  const activeWordIds = new Set(activeWords.map((w) => w.id));
  const activeStats = allStats.filter((s) => activeWordIds.has(s.wordId));

  // Compute mastered count for coin economy (only active, non-archived words)
  const masteredCount = countMasteredWords(activeWords, activeStats);
  const allMastered = canPlayFree(activeWords.length, masteredCount);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const nearestTestDate = activeLists
    .map((l) => l.testDate)
    .filter((d): d is Date => d instanceof Date)
    .filter((d) => d.getTime() >= todayStart.getTime()) // exclude past test dates
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const daysUntilTest = nearestTestDate
    ? Math.max(0, Math.ceil((nearestTestDate.getTime() - now) / 86400000))
    : null;

  return { activeLists, activeList: activeLists[0] ?? null, activeWords, activeStats, allMastered, daysUntilTest };
}
