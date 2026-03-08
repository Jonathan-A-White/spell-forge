import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordListsView } from '../../src/features/word-lists/word-lists-view';
import type { WordList, Word, WordStats, WordLearningProgress } from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

function makeList(overrides: Partial<WordList> = {}): WordList {
  return {
    id: 'list-1',
    profileId: 'profile-1',
    name: 'Week 1 Words',
    testDate: null,
    createdAt: new Date('2026-01-15'),
    source: 'manual',
    active: true,
    archived: false,
    ...overrides,
  };
}

function makeWord(listId: string, text: string, overrides: Partial<Word> = {}): Word {
  return {
    id: `word-${text}`,
    listId,
    profileId: 'profile-1',
    text,
    phonemes: [],
    syllables: [],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    audioCustom: null,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

const defaultProps = {
  allStats: [] as WordStats[],
  learningProgress: [] as WordLearningProgress[],
  onAddList: vi.fn(),
  onEditList: vi.fn(),
  onDeleteList: vi.fn(),
  onArchiveList: vi.fn(),
  onUnarchiveList: vi.fn(),
  onBack: vi.fn(),
};

// ─── Tests ─────────────────────────────────────────────────────

describe('WordListsView edit/delete/archive', () => {
  it('renders action menu button for active lists', () => {
    const list = makeList();
    render(
      <WordListsView
        {...defaultProps}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    const menuBtn = screen.getByTestId(`list-menu-${list.id}`);
    expect(menuBtn).toBeInTheDocument();
  });

  it('opens dropdown with Edit, Archive, Delete on menu click', () => {
    const list = makeList();
    render(
      <WordListsView
        {...defaultProps}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));

    expect(screen.getByTestId(`edit-list-${list.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`archive-list-${list.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`delete-list-${list.id}`)).toBeInTheDocument();
  });

  it('calls onEditList when Edit is clicked', () => {
    const list = makeList();
    const onEditList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onEditList={onEditList}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`edit-list-${list.id}`));

    expect(onEditList).toHaveBeenCalledWith(list);
  });

  it('calls onArchiveList when Archive is clicked', () => {
    const list = makeList();
    const onArchiveList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onArchiveList={onArchiveList}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`archive-list-${list.id}`));

    expect(onArchiveList).toHaveBeenCalledWith(list.id);
  });

  it('shows delete confirmation dialog before deleting', () => {
    const list = makeList();
    const onDeleteList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onDeleteList={onDeleteList}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    // Open menu and click Delete
    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`delete-list-${list.id}`));

    // Should show confirmation dialog, NOT call delete yet
    expect(onDeleteList).not.toHaveBeenCalled();
    expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Word List?')).toBeInTheDocument();
  });

  it('calls onDeleteList when delete is confirmed', () => {
    const list = makeList();
    const onDeleteList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onDeleteList={onDeleteList}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`delete-list-${list.id}`));
    fireEvent.click(screen.getByTestId('delete-confirm-btn'));

    expect(onDeleteList).toHaveBeenCalledWith(list.id);
  });

  it('dismisses delete dialog when Cancel is clicked', () => {
    const list = makeList();
    const onDeleteList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onDeleteList={onDeleteList}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`delete-list-${list.id}`));
    fireEvent.click(screen.getByTestId('delete-cancel-btn'));

    expect(onDeleteList).not.toHaveBeenCalled();
    expect(screen.queryByTestId('delete-confirm-dialog')).not.toBeInTheDocument();
  });

  it('renders Unarchive and Delete for archived lists', () => {
    const list = makeList({ id: 'archived-1', archived: true, active: false });
    render(
      <WordListsView
        {...defaultProps}
        wordLists={[list]}
        allWords={[]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));

    expect(screen.getByTestId(`unarchive-list-${list.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`delete-list-${list.id}`)).toBeInTheDocument();
    // Edit should not be shown for archived lists
    expect(screen.queryByTestId(`edit-list-${list.id}`)).not.toBeInTheDocument();
  });

  it('calls onUnarchiveList when Unarchive is clicked', () => {
    const list = makeList({ id: 'archived-1', archived: true, active: false });
    const onUnarchiveList = vi.fn();
    render(
      <WordListsView
        {...defaultProps}
        onUnarchiveList={onUnarchiveList}
        wordLists={[list]}
        allWords={[]}
      />,
    );

    fireEvent.click(screen.getByTestId(`list-menu-${list.id}`));
    fireEvent.click(screen.getByTestId(`unarchive-list-${list.id}`));

    expect(onUnarchiveList).toHaveBeenCalledWith(list.id);
  });

  it('closes dropdown when clicking the menu button again', () => {
    const list = makeList();
    render(
      <WordListsView
        {...defaultProps}
        wordLists={[list]}
        allWords={[makeWord(list.id, 'cat')]}
      />,
    );

    const menuBtn = screen.getByTestId(`list-menu-${list.id}`);
    fireEvent.click(menuBtn);
    expect(screen.getByTestId(`list-dropdown-${list.id}`)).toBeInTheDocument();

    fireEvent.click(menuBtn);
    expect(screen.queryByTestId(`list-dropdown-${list.id}`)).not.toBeInTheDocument();
  });
});
