// mw-79en7t.39 (Kestrel 13b): the front door's flow. Each turn goes to the tutor-talk grind (a fake here) through
// @voice-kit/talks with the talk kept in its Dexie store; the answer's world opens by id through src/shell/worlds.ts; a
// profile update folds into the child's @learn-kit/learner profile with the turn it came from; with no licence no grind is
// called and the flow offers the worlds.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { createFrontDoorFlow, type TutorTalkAnswer, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import { foldProfileUpdate, turnRef } from '../../src/features/front-door/getting-to-know';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import type { ViewId } from '../../src/shell/worlds';

const CHECKED_AT = 1_760_000_000_000;

function fakeGrind(...answers: TutorTalkAnswer[]) {
  let next = 0;
  return vi.fn<TutorTalkSend>(async () => answers[Math.min(next++, answers.length - 1)]);
}

let store: DexieTalkStore;
let storeCount = 0;
let profileId: string;
const opened: ViewId[] = [];

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  store = createDexieStore({ name: `front-door-flow-test-${++storeCount}`, indexedDB, IDBKeyRange });
  profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  opened.length = 0;
});

afterEach(() => {
  store.close();
  setLicenceStatus(undefined);
});

function flowWith(send: TutorTalkSend) {
  return createFrontDoorFlow({ send, store, profileId, open: (view) => opened.push(view), now: () => CHECKED_AT });
}

describe('the front door flow (mw-79en7t.39)', () => {
  it('AC1: an answer naming "spelling" opens the spelling world', async () => {
    const send = fakeGrind({ words: 'Spelling it is. Let us go!', world: 'spelling' });
    const flow = flowWith(send);
    const talk = await flow.start();

    const reply = await flow.ask(talk, 'I want to do spelling');

    expect(send).toHaveBeenCalledTimes(1);
    expect(reply).toMatchObject({ kind: 'answer', words: 'Spelling it is. Let us go!', world: 'spelling', opened: true });
    expect(opened).toEqual(['progress']);
  });

  it('AC1: a profile update (age 13, boy) lands in the learner profile with its turn', async () => {
    const send = fakeGrind({ words: 'Thirteen, nice. What shall we work on?', profile_update: { age: 13, gender: 'boy' } });
    const flow = flowWith(send);
    const talk = await flow.start();

    const reply = await flow.ask(talk, 'I am thirteen and I am a boy');

    const turn = turnRef(talk, 1);
    expect(reply).toMatchObject({ kind: 'answer', turn, learned: ['learned', 'learned'] });
    const learner = (await profileRepo.getById(profileId))!.learner!;
    expect(learner.age).toEqual({ value: 13, turn, when: CHECKED_AT, sure: 'told' });
    expect(learner.gender).toEqual({ value: 'boy', turn, when: CHECKED_AT, sure: 'told' });
  });

  it('AC1: the talk is kept through the talks store, and the next request carries it and the learner', async () => {
    const send = fakeGrind(
      { words: 'Hello! How old are you?', profile_update: { age: 13 }, memory_update: { add: ['likes dragons'] } },
      { words: 'Great. Spelling or maths?' },
    );
    const flow = flowWith(send);
    const talk = await flow.start();

    await flow.ask(talk, 'Hi');
    await flow.ask(talk, 'I am thirteen');

    const kept = await store.get(talk);
    expect(kept?.turns.map(({ role, text }) => ({ role, text }))).toEqual([
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello! How old are you?' },
      { role: 'user', text: 'I am thirteen' },
      { role: 'assistant', text: 'Great. Spelling or maths?' },
    ]);
    expect(kept?.memory.facts).toEqual(['likes dragons']);

    const [second] = send.mock.calls[1];
    expect(second).toMatchObject({
      schemaVersion: '1',
      message: 'I am thirteen',
      history: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hello! How old are you?' }],
      memory: { facts: ['likes dragons'], summary: '' },
      learner: { age: 13 },
    });
  });

  it('the maths world opens on its own screen', async () => {
    const flow = flowWith(fakeGrind({ words: 'Maths! Here we go.', world: 'maths' }));
    const reply = await flow.ask(await flow.start(), 'maths please');

    expect(reply).toMatchObject({ kind: 'answer', world: 'maths', opened: true });
    expect(opened).toEqual(['maths-home']);
  });

  it('a guessed field is kept as a guess, and a told one later replaces it', async () => {
    await foldProfileUpdate(profileId, { age: 12, guessed: ['age'] }, 'a#1', 1);
    expect((await profileRepo.getById(profileId))!.learner!.age).toEqual({ value: 12, turn: 'a#1', when: 1, sure: 'guessed' });

    const { results } = await foldProfileUpdate(profileId, { age: 13, notes: ['loves dragons'] }, 'a#3', 2);
    expect(results).toEqual(['replaced', 'noted']);
    const learner = (await profileRepo.getById(profileId))!.learner!;
    expect(learner.age).toEqual({ value: 13, turn: 'a#3', when: 2, sure: 'told' });
    expect(learner.notes).toEqual([{ text: 'loves dragons', turn: 'a#3', when: 2 }]);
  });

  it('AC2: without a licence no grind call is made and the flow offers the worlds', async () => {
    setLicenceStatus({ state: 'none', checkedAt: new Date(CHECKED_AT).toISOString() });
    const send = fakeGrind({ words: 'never sent', world: 'spelling' });
    const flow = flowWith(send);
    const talk = await flow.start();

    const reply = await flow.ask(talk, 'I want to do spelling');

    expect(send).toHaveBeenCalledTimes(0);
    expect(reply).toMatchObject({ kind: 'offer-worlds', worlds: ['spelling', 'maths'] });
    expect(opened).toEqual([]);
    expect((await store.get(talk))?.turns).toEqual([]);
  });
});
