// src/share/share-store.ts: the share waiting to be placed, kept in a small Dexie database of its own ('spell-forge-share').
// The service worker parks a share here (src/share/share-target.ts) and the page takes it once; it is apart from the app's
// database on purpose: the worker imports this module, so it must not pull in src/data/db.ts and every table's types, and a
// share is not the child's data (it is not in a backup and a schema bump of the app never touches it).
import Dexie, { type EntityTable } from 'dexie';

export interface ParkedFile {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

export interface ParkedShare {
  id: string;
  createdAt: number;
  /** The shared title, text and link, joined one to a line; undefined when the share carried none. */
  text?: string;
  files: ParkedFile[];
}

class ShareDatabase extends Dexie {
  shares!: EntityTable<ParkedShare, 'id'>;

  constructor() {
    super('spell-forge-share');
    this.version(1).stores({ shares: 'id, createdAt' });
  }
}

export const shareDb = new ShareDatabase();

/** Keeps `share` as the one waiting share: a new one replaces the old. */
export async function parkShare(share: ParkedShare): Promise<void> {
  await shareDb.transaction('rw', shareDb.shares, async () => {
    await shareDb.shares.clear();
    await shareDb.shares.add(share);
  });
}

/** The waiting share `id` names (or the newest when none is named), removed as it is read: a share is handed over once. */
export async function takeParkedShare(id?: string): Promise<ParkedShare | undefined> {
  return shareDb.transaction('rw', shareDb.shares, async () => {
    const share = (id ? await shareDb.shares.get(id) : undefined) ?? (await shareDb.shares.orderBy('createdAt').last());
    await shareDb.shares.clear();
    return share;
  });
}
