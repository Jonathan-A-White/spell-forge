// src/features/talks/talks-store.ts — the talks the front door keeps (its own IndexedDB database), opened for reading in Conversations.
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { FRONT_DOOR_TALKS_DB } from '../front-door/front-door-flow';

/** A connection to the front door's talks. The kit hands Dexie its `indexedDB` option as given, so the page's is named. Close it when done. */
export function openTalksStore(): DexieTalkStore {
  return createDexieStore({ name: FRONT_DOOR_TALKS_DB, indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange });
}
