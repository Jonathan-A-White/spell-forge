// mw-79en7t.41 (Kestrel 13d): a share from the phone lands in the front door's talk. What another app parked (src/share) becomes the
// learner's turn, once: a second boot finds nothing, and the talk is kept in the talks store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { PICTURE_ONLY_QUESTION } from 'voice-kit/talks';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { createFrontDoorFlow, FRONT_DOOR_MAX_PICTURES, FRONT_DOOR_TALKS_DB, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import { landParkedShare, landShare, sharedTurn } from '../../src/features/front-door/share-landing';
import { parkShare, shareDb } from '../../src/share/share-store';
import { takeShare } from '../../src/share/share-target';

const CHECKED_AT = 1_760_000_000_000;

let store: DexieTalkStore;
let storeCount = 0;
let profileId: string;
let send: ReturnType<typeof vi.fn<TutorTalkSend>>;

const flow = () => createFrontDoorFlow({ send, store, profileId, open: () => undefined, now: () => CHECKED_AT });

const park = (id: string, text: string | undefined, pictureNames: string[]) =>
  parkShare({
    id,
    createdAt: CHECKED_AT,
    text,
    files: pictureNames.map((name, i) => ({ name, type: name.endsWith('.txt') ? 'text/plain' : 'image/png', bytes: new Uint8Array([i + 1, 2, 3]).buffer })),
  });

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  await shareDb.shares.clear();
  store = createDexieStore({ name: `share-landing-test-${++storeCount}`, indexedDB, IDBKeyRange });
  profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  send = vi.fn<TutorTalkSend>(async () => ({ words: 'I can see your homework. Which question is hard?' }));
});

afterEach(() => {
  store.close();
});

describe('a share lands in the tutor\'s talk (mw-79en7t.41)', () => {
  it('AC1: a parked picture and words become the learner\'s turn, once, and the talk is kept', async () => {
    await park('s1', 'Homework\nQuestion 4', ['homework.png']);
    const door = flow();
    const talk = await door.start();

    const landed = await landParkedShare(door, talk, 's1');

    expect(landed?.reply).toMatchObject({ kind: 'answer', words: 'I can see your homework. Which question is hard?' });
    expect(send).toHaveBeenCalledTimes(1);
    const [request, files] = send.mock.calls[0];
    expect(request.message).toBe('Homework\nQuestion 4');
    expect(request.pictures).toBe(1);
    expect(files.map((file) => file.name)).toEqual(['homework.png']);
    expect(files[0].mime).toBe('image/png');
    expect(Array.from(files[0].bytes)).toEqual([1, 2, 3]);

    const kept = await store.get(talk);
    expect(kept?.turns.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: 'user', text: 'Homework\nQuestion 4' },
      { role: 'assistant', text: 'I can see your homework. Which question is hard?' },
    ]);
  });

  it('AC1: a second boot does not land the share again', async () => {
    await park('s1', 'Homework', ['homework.png']);
    const door = flow();
    const talk = await door.start();

    expect(await landParkedShare(door, talk, 's1')).toBeDefined();
    expect(await landParkedShare(door, talk, 's1')).toBeUndefined();
    expect(await landParkedShare(door, talk)).toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect((await store.get(talk))?.turns).toHaveLength(2);
    expect(await shareDb.shares.count()).toBe(0);
  });

  it('a share of words only is a turn of words with no picture', async () => {
    await park('s2', 'The gardener planted the seeds.', []);
    const door = flow();
    const talk = await door.start();

    await landParkedShare(door, talk, 's2');

    const [request, files] = send.mock.calls[0];
    expect(request.message).toBe('The gardener planted the seeds.');
    expect(request.pictures).toBeUndefined();
    expect(files).toEqual([]);
  });

  it('a share of a picture only is a turn of the picture, which the talks kit gives its own line', async () => {
    await park('s3', undefined, ['screenshot.png']);
    const door = flow();
    const talk = await door.start();

    await landParkedShare(door, talk, 's3');

    const [request, files] = send.mock.calls[0];
    expect(request.message).toBe(PICTURE_ONLY_QUESTION);
    expect(request.pictures).toBe(1);
    expect(files).toHaveLength(1);
  });

  it('keeps to the most pictures a message takes and the longest message, and leaves out a file that is not a picture', async () => {
    await park('s4', 'x'.repeat(2500), ['a.png', 'b.png', 'c.png', 'd.png', 'notes.txt']);
    const taken = await takeShare('s4');

    const turn = await sharedTurn(taken!);

    expect(turn.pictures).toHaveLength(FRONT_DOOR_MAX_PICTURES);
    expect(turn.pictures.map((picture) => picture.name)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(turn.message).toHaveLength(2000);
  });

  it('lands a share already taken (the app takes it at boot) as one turn', async () => {
    await park('s5', 'Look at this', ['page.png']);
    const taken = await takeShare('s5');
    const door = flow();
    const talk = await door.start();

    const reply = await landShare(door, talk, taken!);

    expect(reply.kind).toBe('answer');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a share that was not there lands nothing and asks the tutor nothing', async () => {
    const door = flow();
    const talk = await door.start();

    expect(await landParkedShare(door, talk)).toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect((await store.get(talk))?.turns).toEqual([]);
  });

  it('the flow\'s own talks store opens on the browser\'s IndexedDB (no store given), so a share lands in a kept talk', async () => {
    await park('s6', 'Look', ['page.png']);
    const door = createFrontDoorFlow({ send, profileId, open: () => undefined, now: () => CHECKED_AT });
    const talk = await door.start();

    const landed = await landParkedShare(door, talk, 's6');

    expect(landed?.reply.kind).toBe('answer');
    const own = createDexieStore({ name: FRONT_DOOR_TALKS_DB, indexedDB, IDBKeyRange });
    expect((await own.get(talk))?.turns).toHaveLength(2);
    own.close();
  });
});
