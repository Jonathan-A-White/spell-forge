// src/moved/moved-page.ts: the page GitHub Pages serves at the old address, /spell-forge/ (mw-79en7t.22). Kestrel lives at
// kestrel.allmymind.org now, and a browser keeps IndexedDB per origin, so a child's words and progress do not follow it: this page offers one tap to
// save each child's data as a file (the app's own export, src/data/import-export.ts) and the new link. The grown-up then opens Kestrel and restores
// the file with Import Profile. It draws with the DOM alone: no React, no router, nothing of the app's screens.
import { exportProfile } from '../data/import-export';
import { profileRepo } from '../data/repositories';

/** Where Kestrel is served. */
export const KESTREL_URL = 'https://kestrel.allmymind.org/';

/** The file a child's data is saved to: kestrel-<name>-backup.json, the name lower-cased with runs of other characters made one dash. */
export function backupFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `kestrel-${slug || 'child'}-backup.json`;
}

async function saveBackup(profileId: string, name: string): Promise<void> {
  const payload = await exportProfile(profileId);
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(name);
  a.click();
  URL.revokeObjectURL(url);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Draws the page into `root`: the heading, a save button for each child on this device, the link and where to put the file. */
export async function showMoved(root: HTMLElement): Promise<void> {
  // A read of a database this device never had would make an empty one: harmless, and the page then offers no save.
  let profiles: { id: string; name: string }[] = [];
  try {
    profiles = (await profileRepo.getAll()).map((p) => ({ id: p.id, name: p.name }));
  } catch {
    profiles = [];
  }

  root.replaceChildren();
  const main = el('main', 'moved');
  main.append(el('h1', 'moved-title', 'Kestrel has moved'));
  main.append(el('p', 'moved-lead', 'This app now lives at a new address, and it is called Kestrel.'));

  if (profiles.length > 0) {
    main.append(
      el(
        'p',
        'moved-text',
        'Your child’s words and progress are kept on this phone, and they do not move by themselves. Save them first, then open Kestrel and use Import Profile in Settings to bring them across.',
      ),
    );
    const list = el('div', 'moved-saves');
    const status = el('p', 'moved-status');
    status.setAttribute('role', 'status');
    for (const profile of profiles) {
      const button = el('button', 'moved-button moved-save', `Save ${profile.name}’s data`);
      button.type = 'button';
      button.addEventListener('click', () => {
        saveBackup(profile.id, profile.name).then(
          () => { status.textContent = `Saved ${backupFileName(profile.name)}. Keep it until Kestrel has imported it.`; },
          () => { status.textContent = 'That did not save. Please try once more.'; },
        );
      });
      list.append(button);
    }
    main.append(list, status);
  }

  const link = el('a', 'moved-button moved-open', 'Open Kestrel');
  link.href = KESTREL_URL;
  main.append(link);
  root.append(main);
}
