// @vitest-environment jsdom
// Rendering tests for the learning screen's memory aid hints.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LearningScreen } from '../../src/features/learning/learning-screen';
import { wordListRepo } from '../../src/data/repositories/word-list-repo';
import { wordRepo } from '../../src/data/repositories/word-repo';
import { learningProgressRepo } from '../../src/data/repositories/learning-progress-repo';
import { activityProgressRepo } from '../../src/data/repositories/activity-progress-repo';
import type { AudioManager } from '../../src/audio/manager';
import type { Profile, Word, WordLearningProgress } from '../../src/contracts/types';

const audioManager: AudioManager = {
  sayWord: vi.fn().mockResolvedValue(undefined),
  sayWordSlowly: vi.fn().mockResolvedValue(undefined),
  spellWord: vi.fn().mockResolvedValue(undefined),
  sayThenSpell: vi.fn().mockResolvedValue(undefined),
  isBusy: () => false,
  runExclusive: vi.fn(async (action: () => Promise<void>) => {
    await action();
    return true;
  }),
  onBusyChange: () => () => {},
};

const profile = {
  id: 'p1',
  name: 'Kid',
  settings: { tapTargetSize: 'medium', learningStrategy: 'easy-to-hard' },
} as unknown as Profile;

const word: Word = {
  id: 'w1',
  listId: 'l1',
  profileId: 'p1',
  text: 'pursue',
  phonemes: [],
  syllables: [],
  patterns: [],
  imageUrl: null,
  imageCached: false,
  createdAt: new Date(),
};

function progressAt(successes: number): WordLearningProgress {
  return {
    id: 'p1:w1',
    profileId: 'p1',
    wordId: 'w1',
    wordListId: 'l1',
    stage: 0,
    consecutiveSuccesses: successes,
    consecutiveFailures: 0,
    mastered: false,
    totalAttempts: successes,
    totalErrors: 0,
    lastAttemptAt: null,
    createdAt: new Date(),
  };
}

function mockRepos(progress: WordLearningProgress[]) {
  vi.spyOn(activityProgressRepo, 'get').mockResolvedValue(undefined as never);
  vi.spyOn(activityProgressRepo, 'save').mockResolvedValue(undefined as never);
  vi.spyOn(activityProgressRepo, 'clear').mockResolvedValue(undefined as never);
  vi.spyOn(wordListRepo, 'getActive').mockResolvedValue([{ id: 'l1' }] as never);
  vi.spyOn(wordRepo, 'getByListId').mockResolvedValue([word]);
  vi.spyOn(learningProgressRepo, 'getByProfileId').mockResolvedValue(progress);
}

function hintToggles() {
  return screen.queryAllByRole('button').filter((b) =>
    /Sound It Out|Pattern Spotter|Memory Tricks/.test(b.getAttribute('aria-label') ?? ''),
  );
}

describe('LearningScreen memory aid hints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows all three hint toggles at Stage 1, with the first rep expanded', async () => {
    mockRepos([]);
    render(<LearningScreen profile={profile} audioManager={audioManager} onBack={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/Stage 1/)).toBeTruthy());

    const toggles = hintToggles();
    expect(toggles).toHaveLength(3);
    // Rep 1 features Sound It Out — expanded; the others start collapsed
    expect(toggles[0].getAttribute('aria-label')).toBe('Hide Sound It Out');
    expect(toggles[1].getAttribute('aria-label')).toBe('Show Pattern Spotter');
    expect(toggles[2].getAttribute('aria-label')).toBe('Show Memory Tricks');
  });

  it('keeps every aid openable on the last rep', async () => {
    mockRepos([progressAt(2)]);
    render(<LearningScreen profile={profile} audioManager={audioManager} onBack={() => {}} />);
    await waitFor(() => expect(screen.queryByText(/Rep 3\/3/)).toBeTruthy());

    const toggles = hintToggles();
    expect(toggles).toHaveLength(3);
    // Rep 3 features Memory Tricks
    expect(toggles[2].getAttribute('aria-label')).toBe('Hide Memory Tricks');

    // Sound It Out is collapsed but still opens on tap
    expect(toggles[0].getAttribute('aria-label')).toBe('Show Sound It Out');
    fireEvent.click(toggles[0]);
    expect(toggles[0].getAttribute('aria-label')).toBe('Hide Sound It Out');
    // ...and its content is on screen (syllable chunk for "pur")
    expect(screen.queryByRole('button', { name: 'Hear "pur"' })).toBeTruthy();
  });
});
