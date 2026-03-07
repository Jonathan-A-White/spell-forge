import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressView } from '../../src/features/dashboard/progress-view';
import type { WordList, Word, WordStats, WordLearningProgress } from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

function makeList(overrides: Partial<WordList> = {}): WordList {
  return {
    id: 'list-1',
    profileId: 'profile-1',
    name: 'Week 1',
    testDate: new Date('2026-03-14'),
    createdAt: new Date('2026-03-07'),
    source: 'manual',
    active: true,
    archived: false,
    ...overrides,
  };
}

function makeWord(listId: string, text: string): Word {
  return {
    id: `word-${text}`,
    listId,
    profileId: 'profile-1',
    text,
    phonemes: [],
    syllables: [text],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    audioCustom: null,
    createdAt: new Date('2026-03-07'),
  };
}

function makeStat(wordId: string, bucket: WordStats['currentBucket']): WordStats {
  return {
    id: `stats-${wordId}`,
    wordId,
    profileId: 'profile-1',
    lastAsked: new Date(),
    timesAsked: bucket === 'new' ? 0 : 3,
    timesWrong: 0,
    timesStruggledRight: 0,
    timesEasyRight: 3,
    consecutiveCorrect: 3,
    currentBucket: bucket,
    nextReviewDate: new Date(),
    difficultyScore: 0.5,
    techniqueHistory: [],
  };
}

const defaultProps = {
  streakData: null,
  allStats: [] as WordStats[],
  learningProgress: [] as WordLearningProgress[],
  daysUntilTest: 7,
  onStartPractice: vi.fn(),
  onAddWords: vi.fn(),
  onBack: vi.fn(),
};

// ─── Tests ─────────────────────────────────────────────────────

describe('ProgressView multi-list readiness', () => {
  it('aggregates words from a single active list', () => {
    const list = makeList({ id: 'list-a', name: 'Text' });
    const words = [makeWord('list-a', 'cat'), makeWord('list-a', 'dog')];

    render(
      <ProgressView
        {...defaultProps}
        allWords={words}
        activeLists={[list]}
      />,
    );

    expect(screen.getByText('Text')).toBeTruthy();
    expect(screen.getByText('0 of 2 words ready')).toBeTruthy();
  });

  it('aggregates words across multiple active lists', () => {
    const listA = makeList({ id: 'list-a', name: 'Text' });
    const listB = makeList({ id: 'list-b', name: 'Unit 3, WK 6' });
    const words = [
      makeWord('list-a', 'known'),
      makeWord('list-a', 'because'),
      makeWord('list-b', 'emergency'),
      makeWord('list-b', 'message'),
      makeWord('list-b', 'edge'),
    ];

    render(
      <ProgressView
        {...defaultProps}
        allWords={words}
        activeLists={[listA, listB]}
      />,
    );

    // Should show combined count from both lists
    expect(screen.getByText('2 Active Lists')).toBeTruthy();
    expect(screen.getByText('0 of 5 words ready')).toBeTruthy();
  });

  it('counts mastered/familiar words as ready across multiple lists', () => {
    const listA = makeList({ id: 'list-a', name: 'Text' });
    const listB = makeList({ id: 'list-b', name: 'Unit 3' });
    const words = [
      makeWord('list-a', 'cat'),
      makeWord('list-a', 'dog'),
      makeWord('list-b', 'edge'),
      makeWord('list-b', 'judge'),
    ];
    const stats = [
      makeStat('word-cat', 'mastered'),
      makeStat('word-edge', 'familiar'),
    ];

    render(
      <ProgressView
        {...defaultProps}
        allWords={words}
        allStats={stats}
        activeLists={[listA, listB]}
      />,
    );

    expect(screen.getByText('2 of 4 words ready')).toBeTruthy();
  });

  it('does not count words from inactive/archived lists', () => {
    const activeList = makeList({ id: 'list-a', name: 'Active' });
    const inactiveList = makeList({ id: 'list-b', name: 'Inactive', active: false });
    const words = [
      makeWord('list-a', 'cat'),
      makeWord('list-b', 'dog'), // from inactive list — should not appear
    ];

    render(
      <ProgressView
        {...defaultProps}
        allWords={words}
        activeLists={[activeList]} // only active list passed
      />,
    );

    // Only 1 word from the active list
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('0 of 1 words ready')).toBeTruthy();
  });

  it('shows nothing when there are no active lists', () => {
    render(
      <ProgressView
        {...defaultProps}
        allWords={[makeWord('list-x', 'cat')]}
        activeLists={[]}
      />,
    );

    // Readiness indicator should not render
    expect(screen.queryByText(/words ready/)).toBeNull();
  });
});
