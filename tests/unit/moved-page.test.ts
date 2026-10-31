// mw-79en7t.22: the page GitHub Pages serves at /spell-forge/ now: Kestrel has moved, a one-tap export of each child's data (IndexedDB does not
// follow a new origin), and the new link. Its logic is src/moved/moved-page.ts; moved/index.html loads src/moved/main.ts.
import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { parseExportJson } from '../../src/data/import-export';
import { backupFileName, KESTREL_URL, showMoved } from '../../src/moved/moved-page';

let root: HTMLElement;
let saved: { name: string; blob: Blob }[];

beforeEach(async () => {
  await db.delete();
  await db.open();
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root')!;
  saved = [];
  let last: Blob | undefined;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => ((last = b), 'blob:x'), revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: last! });
  });
});
afterEach(() => vi.restoreAllMocks());

describe('the moved page', () => {
  it('points at the new address', async () => {
    expect(KESTREL_URL).toBe('https://kestrel.allmymind.org/');
    await showMoved(root);
    expect(screen.getByRole('heading', { name: /Kestrel has moved/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Kestrel/ })).toHaveAttribute('href', KESTREL_URL);
  });

  it('offers one tap to save each child’s data, and the file restores in Kestrel', async () => {
    const sam = await profileRepo.createLearner('Sam Lee', 'dragon-forge', { ...DEFAULT_SETTINGS });
    await profileRepo.createLearner('Ada', 'dragon-forge', { ...DEFAULT_SETTINGS });
    await showMoved(root);
    expect(within(root).getAllByRole('button')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Save Sam Lee’s data' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toBe('kestrel-sam-lee-backup.json');
    const payload = parseExportJson(await saved[0].blob.text());
    expect(payload.profile.id).toBe(sam.id);
    expect(payload.profile.name).toBe('Sam Lee');
  });

  it('says where to put the file in Kestrel', async () => {
    await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS });
    await showMoved(root);
    expect(root.textContent).toContain('Import Profile');
  });

  it('with nothing on this device, offers no save and still gives the link', async () => {
    await showMoved(root);
    expect(within(root).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /Open Kestrel/ })).toBeInTheDocument();
  });

  it('names the file for the child', () => {
    expect(backupFileName('Mary Jo  O’Neil')).toBe('kestrel-mary-jo-o-neil-backup.json');
  });
});

describe('moved/index.html', () => {
  it('is a page of its own, not the app’s', () => {
    const html = readFileSync('moved/index.html', 'utf-8');
    expect(html).toContain('<title>Kestrel has moved</title>');
    expect(html).toContain('src/moved/main.ts');
    expect(html).toContain('https://kestrel.allmymind.org/');
  });
});
