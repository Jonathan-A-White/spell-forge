// mw-6ww.175.97: a word's attempts (word detail) and the monster stable's creatures give one order for rows that
// tie on their timestamp, over 20 shuffles of the input (class equal-timestamp-sort-has-no-tiebreak).
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordDetailView } from '../../src/features/dashboard/word-detail-view';
import { newestAttemptsFirst } from '../../src/features/dashboard/attempt-order';
import { MonsterStable } from '../../src/features/rewards/monster-stable';
import { db } from '../../src/data/db';
import type { CompletedCreature, Profile, TechniqueResult, Word, WordStats } from '../../src/contracts/types';

const T = 1_700_000_000_000;

function shuffled<A>(items: readonly A[], seed: number): A[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const attempt = (techniqueId: string, offset = 0): TechniqueResult => ({
  techniqueId,
  timestamp: new Date(T + offset),
  correct: true,
  responseTimeMs: 1000,
  struggled: false,
  scaffoldingUsed: false,
});

describe('word detail: a word\'s attempts', () => {
  // A TechniqueResult has no id: the stored history's own order is the tie-break, so the shuffles move the rows
  // around the tied pair and leave the pair in the order it was stored.
  const tiedFirst = attempt('tied-first');
  const tiedSecond = attempt('tied-second');
  const others = [attempt('late', 5), attempt('early', -5), attempt('earlier', -9)];

  it('gives one order over 20 shuffles, newest first, the later stored of two equal attempts first', () => {
    const orders = Array.from({ length: 20 }, (_, run) => {
      const rest = shuffled(others, run + 1);
      const history = [rest[0], tiedFirst, rest[1], tiedSecond, rest[2]];
      return newestAttemptsFirst(history).map((r) => r.techniqueId);
    });
    for (const order of orders) expect(order).toEqual(['late', 'tied-second', 'tied-first', 'early', 'earlier']);
  });

  it('shows the history in that order on the screen', async () => {
    await db.delete();
    await db.open();
    const word = { id: 'w1', text: 'because' } as Word;
    const stats = {
      wordId: 'w1',
      profileId: 'p1',
      timesAsked: 3,
      timesWrong: 0,
      currentBucket: 'learning',
      consecutiveCorrect: 3,
      longestCorrectStreak: 3,
      difficultyScore: 0.5,
      techniqueHistory: [attempt('first-stored'), attempt('second-stored'), attempt('older', -5)],
    } as unknown as WordStats;
    await db.words.put(word);
    await db.wordStats.put({ ...stats, id: 's1' } as WordStats);
    render(<WordDetailView wordId="w1" profileId="p1" onBack={() => {}} />);
    const rows = await screen.findAllByText(/stored|Older/i);
    expect(rows.map((r) => r.textContent)).toEqual(['Second Stored', 'First Stored', 'Older']);
  });
});

describe('monster stable: creatures of one rarity completed at one millisecond', () => {
  const creature = (id: string, rarity: CompletedCreature['rarity'], offset = 0): CompletedCreature =>
    ({
      id,
      profileId: 'p1',
      themeId: 'dragon-forge',
      name: id,
      completedAt: new Date(T + offset),
      rarity,
      level: 1,
      appearance: { bodyShape: 0, primaryColor: 0, accentColor: 0, eyes: 0, mouth: 0, extra: 0 },
    }) as unknown as CompletedCreature;
  const profile = { id: 'p1', themeId: 'dragon-forge' } as Profile;
  const rows = [
    creature('Zed-a', 'common'),
    creature('Zed-b', 'common'),
    creature('Zed-c', 'common'),
    creature('Zed-late', 'common', 5),
    creature('Zed-early', 'common', -5),
    creature('Zed-gem', 'legendary', -50),
  ];

  it('lists them in one order over 20 shuffles: rarity, then newest, then the greater id', () => {
    const seen = Array.from({ length: 20 }, (_, run) => {
      const { container, unmount } = render(
        <MonsterStable profile={profile} collection={shuffled(rows, run + 1)} onBack={() => {}} />,
      );
      const text = container.textContent ?? '';
      unmount();
      return ['Zed-gem', 'Zed-late', 'Zed-c', 'Zed-b', 'Zed-a', 'Zed-early'].map((id) => text.indexOf(id));
    });
    for (const positions of seen) {
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((x, y) => x - y)).toEqual(positions);
    }
  });
});
