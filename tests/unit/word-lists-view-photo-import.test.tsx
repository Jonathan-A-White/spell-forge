// tests/unit/word-lists-view-photo-import.test.tsx — a Word Lists row says what its photo import is doing
// (mw-z361n.5): 'Reading your photo...' while it reads, 'Read on this device' after a device read, nothing
// after a factory read. The photo-import module is mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import type { PhotoImportStatus, WordList } from '../../src/contracts/types';
import { WordListsView } from '../../src/features/word-lists/word-lists-view';

const imports = vi.hoisted(() => {
  const statuses = new Map<string, PhotoImportStatus | null>();
  const listeners = new Set<() => void>();
  return {
    statuses,
    set(listId: string, status: PhotoImportStatus | null) {
      statuses.set(listId, status);
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('../../src/features/word-lists/photo-import', () => ({
  usePhotoImportStatus: (listId: string | null | undefined) =>
    useSyncExternalStore(imports.subscribe, () => (listId ? (imports.statuses.get(listId) ?? null) : null)),
}));

function makeList(id: string, name: string, overrides: Partial<WordList> = {}): WordList {
  return {
    id,
    profileId: 'profile-1',
    name,
    language: 'en',
    testDate: null,
    createdAt: new Date('2026-01-15'),
    source: 'camera',
    active: true,
    archived: false,
    ...overrides,
  };
}

function renderView(lists: WordList[]) {
  render(
    <WordListsView
      wordLists={lists}
      allWords={[]}
      allStats={[]}
      learningProgress={[]}
      testResults={[]}
      onAddList={vi.fn()}
      onEditList={vi.fn()}
      onDeleteList={vi.fn()}
      onBack={vi.fn()}
    />,
  );
}

const row = (name: string) => screen.getByText(name).closest('[role="button"]') as HTMLElement;

beforeEach(() => {
  imports.statuses.clear();
});

describe('WordListsView photo import labels', () => {
  it("says 'Reading your photo...' in the row of a list whose import is reading, and only there", () => {
    imports.statuses.set('a', 'reading');
    renderView([makeList('a', 'Photo list 1 Oct'), makeList('b', 'Week 2')]);

    expect(within(row('Photo list 1 Oct')).getByRole('status')).toHaveTextContent('Reading your photo...');
    expect(within(row('Week 2')).queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByText('Reading your photo...')).toHaveLength(1);
  });

  it("says 'Read on this device' in the row of a list read on the device", () => {
    imports.statuses.set('a', 'device');
    renderView([makeList('a', 'Week 1'), makeList('b', 'Week 2')]);

    expect(within(row('Week 1')).getByRole('status')).toHaveTextContent('Read on this device');
    expect(within(row('Week 2')).queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no label for a factory read, a failed read, or no import', () => {
    imports.statuses.set('a', 'factory');
    imports.statuses.set('b', 'failed');
    renderView([makeList('a', 'Week 1'), makeList('b', 'Week 2'), makeList('c', 'Week 3')]);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Read on this device')).not.toBeInTheDocument();
    expect(screen.queryByText('Reading your photo...')).not.toBeInTheDocument();
  });

  it('follows the import: reading, then read on the device, then nothing once it is cleared', () => {
    renderView([makeList('a', 'Week 1')]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => imports.set('a', 'reading'));
    expect(screen.getByRole('status')).toHaveTextContent('Reading your photo...');

    act(() => imports.set('a', 'device'));
    expect(screen.getByRole('status')).toHaveTextContent('Read on this device');

    act(() => imports.set('a', null));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
