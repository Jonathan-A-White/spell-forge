// tests/unit/list-editor-photo-import.test.tsx — the list editor hands a picked photo to the photo-import
// queue (mw-z361n.5): a new list is saved first, the words area says what the import is doing, and the
// words that land are appended without losing what the parent typed. The photo-import module is mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import type { PhotoImportStatus, WordList } from '../../src/contracts/types';
import type { OcrManager } from '../../src/ocr';
import { db } from '../../src/data/db';
import { addWordsToList } from '../../src/features/word-lists/add-words';
import { ListEditor } from '../../src/features/word-lists/list-editor';

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
    start: vi.fn(),
  };
});

vi.mock('../../src/features/word-lists/photo-import', () => ({
  startPhotoImport: imports.start,
  usePhotoImportStatus: (listId: string | null | undefined) =>
    useSyncExternalStore(imports.subscribe, () => (listId ? (imports.statuses.get(listId) ?? null) : null)),
}));

const ocrManager = { extractWords: vi.fn(), setRemoteEndpoint: vi.fn() } as unknown as OcrManager;

function makeList(overrides: Partial<WordList> = {}): WordList {
  return {
    id: 'list-1',
    profileId: 'profile-1',
    name: 'Week 1',
    language: 'en',
    testDate: null,
    createdAt: new Date('2026-01-15'),
    source: 'manual',
    active: true,
    archived: false,
    ...overrides,
  };
}

const photo = () => new File(['photo'], 'list.jpg', { type: 'image/jpeg' });

function pickPhoto() {
  fireEvent.change(screen.getByTestId('camera-file-input'), { target: { files: [photo()] } });
}

function renderEditor(props: Partial<React.ComponentProps<typeof ListEditor>> = {}) {
  const onCreateList = vi.fn(async (name: string, _testDate: Date | null, language: string) =>
    makeList({ id: 'new-list', name, language, source: 'camera' }),
  );
  const onCancel = vi.fn();
  const onSave = vi.fn();
  render(
    <ListEditor
      list={null}
      existingWords={[]}
      ocrManager={ocrManager}
      profileId="profile-1"
      onCreateList={onCreateList}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onCreateList, onCancel, onSave };
}

const textarea = () => screen.getByPlaceholderText(/knight/) as HTMLTextAreaElement;
/** The words area as lines; the order words landed in is not promised, so landed words are compared sorted. */
const lines = () => textarea().value.split('\n');

beforeEach(async () => {
  imports.statuses.clear();
  imports.start.mockReset();
  imports.start.mockResolvedValue({});
  await db.words.clear();
  await db.wordStats.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ListEditor photo import: starting', () => {
  it('saves a new list under the typed name first, then starts the import for it, not the device OCR', async () => {
    const { onCreateList } = renderEditor();
    fireEvent.change(screen.getByPlaceholderText('e.g., Week 12'), { target: { value: 'Week 5' } });
    pickPhoto();

    await waitFor(() => expect(imports.start).toHaveBeenCalledTimes(1));
    expect(onCreateList).toHaveBeenCalledWith('Week 5', null, 'en');
    const [params, deps] = imports.start.mock.calls[0];
    expect(params).toMatchObject({ listId: 'new-list', profileId: 'profile-1', language: 'en' });
    expect((params.file as File).name).toBe('list.jpg');
    expect(deps.ocrManager).toBe(ocrManager);
    expect(ocrManager.extractWords).not.toHaveBeenCalled();
  });

  it("names a new list 'Photo list' plus the date when no name was typed", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    const { onCreateList } = renderEditor();
    pickPhoto();

    await waitFor(() => expect(imports.start).toHaveBeenCalledTimes(1));
    expect(onCreateList).toHaveBeenCalledWith('Photo list 1 Oct', null, 'en');
    expect(screen.getByPlaceholderText('e.g., Week 12')).toHaveValue('Photo list 1 Oct');
  });

  it('keeps editing the saved list: a second photo goes to the same list, no second list', async () => {
    const { onCreateList } = renderEditor();
    pickPhoto();
    await waitFor(() => expect(imports.start).toHaveBeenCalledTimes(1));
    act(() => imports.set('new-list', 'factory'));
    pickPhoto();
    await waitFor(() => expect(imports.start).toHaveBeenCalledTimes(2));

    expect(onCreateList).toHaveBeenCalledTimes(1);
    expect(imports.start.mock.calls[1][0]).toMatchObject({ listId: 'new-list' });
  });

  it('does not save another list when editing one that exists', async () => {
    const list = makeList();
    const { onCreateList } = renderEditor({ list, existingWords: ['cat'] });
    pickPhoto();

    await waitFor(() => expect(imports.start).toHaveBeenCalledTimes(1));
    expect(onCreateList).not.toHaveBeenCalled();
    expect(imports.start.mock.calls[0][0]).toMatchObject({ listId: 'list-1', profileId: 'profile-1' });
  });
});

describe('ListEditor photo import: reading', () => {
  it("says 'Reading your photo...' (role status) and disables the photo button while the import is reading", async () => {
    renderEditor({ list: makeList() });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByTestId('camera-import-btn')).toBeEnabled();

    act(() => imports.set('list-1', 'reading'));

    expect(screen.getByRole('status')).toHaveTextContent('Reading your photo...');
    expect(screen.getByTestId('camera-import-btn')).toBeDisabled();
  });

  it('shows the reading label as soon as a new list has its photo, and leaves the words area editable', async () => {
    renderEditor();
    pickPhoto();
    await waitFor(() => expect(imports.start).toHaveBeenCalled());
    act(() => imports.set('new-list', 'reading'));

    expect(screen.getByRole('status')).toHaveTextContent('Reading your photo...');
    expect(textarea()).toBeEnabled();
  });

  it("Cancel leaves while reading and does not cancel or lose the import", async () => {
    const { onCancel } = renderEditor({ list: makeList() });
    act(() => imports.set('list-1', 'reading'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(imports.start).not.toHaveBeenCalled();
    expect(imports.statuses.get('list-1')).toBe('reading');
  });

  it('appends the words that land while the editor is open and keeps the parent\'s edits', async () => {
    const list = makeList();
    await addWordsToList({ listId: 'list-1', profileId: 'profile-1', words: ['cat'] });
    renderEditor({ list, existingWords: ['cat'] });
    pickPhoto();
    await waitFor(() => expect(imports.start).toHaveBeenCalled());
    act(() => imports.set('list-1', 'reading'));

    // The parent keeps typing while the photo is read: a new word, and 'cat' taken out.
    fireEvent.change(textarea(), { target: { value: 'dog' } });
    await addWordsToList({ listId: 'list-1', profileId: 'profile-1', words: ['sun', 'moon'] });
    act(() => imports.set('list-1', 'factory'));

    await waitFor(() => expect(lines()).toHaveLength(3));
    expect(lines()[0]).toBe('dog');
    expect(lines().slice(1).sort()).toEqual(['moon', 'sun']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('appends words that landed before the live status was seen, once the import call returns', async () => {
    imports.start.mockImplementation(async () => {
      await addWordsToList({ listId: 'new-list', profileId: 'profile-1', words: ['edge', 'badge'] });
    });
    renderEditor();
    fireEvent.change(textarea(), { target: { value: 'judge' } });
    pickPhoto();

    await waitFor(() => expect(lines()).toHaveLength(3));
    expect(lines()[0]).toBe('judge');
    expect(lines().slice(1).sort()).toEqual(['badge', 'edge']);
  });

  it('does not put a word back that the parent took out after it landed', async () => {
    renderEditor({ list: makeList() });
    act(() => imports.set('list-1', 'reading'));
    await addWordsToList({ listId: 'list-1', profileId: 'profile-1', words: ['sun'] });
    act(() => imports.set('list-1', 'factory'));
    await waitFor(() => expect(textarea().value).toBe('sun'));

    fireEvent.change(textarea(), { target: { value: '' } });
    act(() => imports.set('list-1', 'device'));
    act(() => imports.set('list-1', 'factory'));
    expect(textarea().value).toBe('');
  });
});

describe('ListEditor photo import: after the read', () => {
  it("says 'Read on this device' after a device read", async () => {
    renderEditor({ list: makeList() });
    act(() => imports.set('list-1', 'reading'));
    act(() => imports.set('list-1', 'device'));

    expect(screen.getByRole('status')).toHaveTextContent('Read on this device');
    expect(screen.getByTestId('camera-import-btn')).toBeEnabled();
  });

  it('says nothing after a factory read', async () => {
    renderEditor({ list: makeList() });
    act(() => imports.set('list-1', 'reading'));
    act(() => imports.set('list-1', 'factory'));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/No words found/)).not.toBeInTheDocument();
  });

  it("shows 'No words found. Try a clearer photo.' after a failed read", async () => {
    // a slow start, as on a loaded host: the editor keeps its own reading label until the start call returns
    imports.start.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({}), 150)));
    renderEditor({ list: makeList() });
    pickPhoto();
    await waitFor(() => expect(imports.start).toHaveBeenCalled());
    act(() => imports.set('list-1', 'reading'));
    act(() => imports.set('list-1', 'failed'));

    expect(screen.getByText('No words found. Try a clearer photo.')).toBeInTheDocument();
    // the label also stays while the start call is pending, so wait for it to go rather than read it once
    await waitFor(() => expect(screen.queryByText('Reading your photo...')).not.toBeInTheDocument());
    expect(screen.getByTestId('camera-import-btn')).toBeEnabled();
  });

  it("shows the error message when the import cannot be started at all", async () => {
    imports.start.mockRejectedValue(new Error('disk full'));
    renderEditor({ list: makeList() });
    pickPhoto();

    expect(await screen.findByText('disk full')).toBeInTheDocument();
    expect(screen.getByTestId('camera-import-btn')).toBeEnabled();
  });
});
