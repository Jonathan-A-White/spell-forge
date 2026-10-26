// mw-79en7t.20: the request to the maker. When the tutor's answer says the app cannot do what was asked (maker_request), the flow's
// reply offers it; the Send the child or grown-up taps files ONE request through @pwa-kit/requests with the talk's words and who
// asked; twice is one. The tutor-talk grind and the grind that carries the request to the maker are fakes here: tests never
// touch the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { PrivateKey } from '@bsv/sdk';
import { GROWN_UP, type MakerRequest } from 'pwa-kit/requests';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { createFrontDoorFlow, type TutorTalkAnswer, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import { isTutorTalkAnswer } from '../../src/features/front-door/tutor-talk-send';
import { NO_KEY } from '../../src/features/tutor/tutor-flow';
import type { SendGristParams } from '../../src/grist';
import { sendToMaker } from '../../src/features/requests/file-from-talk';
import {
  MAKER_REQUEST_GRIND,
  MakerRequestError,
  createMakerRequests,
  createMakerSender,
} from '../../src/features/requests';
import { setLicenceStatus } from '../../src/shell/licence-gate';

const NOW = 1_760_000_000_000;
const ASK = 'Can you read my maths book out loud to me?';
const SUMMARY = 'Read a maths book aloud';

let store: DexieTalkStore;
let storeCount = 0;
let profileId: string;

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  store = createDexieStore({ name: `file-from-talk-test-${++storeCount}`, indexedDB, IDBKeyRange });
  profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  localStorage.clear();
});

afterEach(() => {
  store.close();
  setLicenceStatus(undefined);
});

const fakeGrind = (answer: TutorTalkAnswer) => vi.fn<TutorTalkSend>(async () => answer);

function flowWith(send: TutorTalkSend) {
  return createFrontDoorFlow({ send, store, profileId, open: () => undefined, now: () => NOW });
}

/** The grind that carries a request to the maker: a fake that keeps what it was sent and answers the id. */
function fakeMaker() {
  const sent: MakerRequest[] = [];
  const send = vi.fn(async (request: MakerRequest) => {
    sent.push(request);
    return { id: `maker-${sent.length}` };
  });
  return { sent, send };
}

function requestsWith(send: ReturnType<typeof fakeMaker>['send']) {
  return createMakerRequests({ send, appVersion: '0.1.0', now: () => NOW });
}

describe('the tutor offers to pass it on (mw-79en7t.20 AC1)', () => {
  it('an answer with maker_request is an offer carrying the talk, his words and the tutor\'s summary', async () => {
    const flow = flowWith(
      fakeGrind({ words: 'The app cannot do that yet. Shall I pass it on?', maker_request: { summary: SUMMARY } }),
    );
    const talk = await flow.start();

    const reply = await flow.ask(talk, ASK);

    expect(reply).toMatchObject({ kind: 'answer', maker: { talkId: talk, words: ASK, summary: SUMMARY } });
  });

  it('an answer without maker_request offers nothing', async () => {
    const flow = flowWith(fakeGrind({ words: 'Sure. Which question?' }));
    const talk = await flow.start();

    const reply = await flow.ask(talk, 'Help me with number 4');

    expect(reply).toMatchObject({ kind: 'answer' });
    expect(reply).not.toHaveProperty('maker');
  });

  it('the answer guard takes maker_request as the schema does, and refuses what the schema refuses', () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), 'grinds/tutor-talk.answer.schema.json'), 'utf8')) as {
      properties: { maker_request: { required: string[]; properties: { summary: { maxLength: number } } } };
    };
    expect(schema.properties.maker_request.required).toEqual(['summary']);
    expect(schema.properties.maker_request.properties.summary.maxLength).toBe(200);
    expect(isTutorTalkAnswer({ words: 'Hi', maker_request: { summary: SUMMARY } })).toBe(true);
    for (const bad of [{}, { summary: '' }, { summary: 'x'.repeat(201) }, { summary: SUMMARY, extra: 1 }, 'text']) {
      expect(isTutorTalkAnswer({ words: 'Hi', maker_request: bad }), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('Send files one request with the talk\'s words and who (mw-79en7t.20 AC1)', () => {
  it('a child\'s Send files one request: his words, the summary, the talk and his id', async () => {
    const flow = flowWith(fakeGrind({ words: 'Shall I pass it on?', maker_request: { summary: SUMMARY } }));
    const talk = await flow.start();
    const reply = await flow.ask(talk, ASK);
    const maker = fakeMaker();
    const requests = requestsWith(maker.send);
    if (reply.kind !== 'answer' || !reply.maker) throw new Error('no offer');

    const result = await sendToMaker(requests, reply.maker, profileId);

    expect(result.outcome).toBe('sent');
    expect(maker.sent).toEqual([
      { kind: 'tutor-ask', text: ASK, summary: SUMMARY, reference: talk, who: profileId, app_version: '0.1.0' },
    ]);
    expect(await requests.list()).toMatchObject([{ words: ASK, who: profileId, talkId: talk, status: 'sent' }]);
  });

  it('a grown-up\'s Send is filed as the grown-up', async () => {
    const maker = fakeMaker();
    const requests = requestsWith(maker.send);

    await sendToMaker(requests, { talkId: 't1', words: ASK, summary: SUMMARY }, GROWN_UP);

    expect(maker.sent[0]).toMatchObject({ who: GROWN_UP });
  });

  it('tapping Send twice is one request: the second says duplicate and sends nothing', async () => {
    const maker = fakeMaker();
    const requests = requestsWith(maker.send);
    const offer = { talkId: 't1', words: ASK, summary: SUMMARY };

    const first = await sendToMaker(requests, offer, profileId);
    const second = await sendToMaker(requests, offer, profileId);

    expect([first.outcome, second.outcome]).toEqual(['sent', 'duplicate']);
    expect(maker.send).toHaveBeenCalledTimes(1);
    expect(await requests.list()).toHaveLength(1);
  });

  it('two taps at once are one request too', async () => {
    const maker = fakeMaker();
    const requests = requestsWith(maker.send);
    const offer = { talkId: 't1', words: ASK, summary: SUMMARY };

    const both = await Promise.all([sendToMaker(requests, offer, profileId), sendToMaker(requests, offer, profileId)]);

    expect(both.map((r) => r.outcome).sort()).toEqual(['duplicate', 'sent']);
    expect(maker.send).toHaveBeenCalledTimes(1);
  });

  it('a send that fails keeps nothing, so the same words can be tried again', async () => {
    let fail = true;
    const send = vi.fn(async (request: MakerRequest) => {
      if (fail) throw new Error('offline');
      return { id: request.reference };
    });
    const requests = requestsWith(send);
    const offer = { talkId: 't1', words: ASK, summary: SUMMARY };

    await expect(sendToMaker(requests, offer, profileId)).rejects.toThrow('offline');
    expect(await requests.list()).toEqual([]);
    fail = false;
    expect((await sendToMaker(requests, offer, profileId)).outcome).toBe('sent');
  });

  it('requests are kept on the phone (localStorage), so a new session still lists them', async () => {
    const maker = fakeMaker();
    await sendToMaker(requestsWith(maker.send), { talkId: 't1', words: ASK, summary: SUMMARY }, profileId);

    const later = requestsWith(fakeMaker().send);

    expect(await later.list()).toMatchObject([{ words: ASK, who: profileId }]);
  });
});

describe('the grind that carries the request to the maker', () => {
  const key = PrivateKey.fromRandom();
  const SENT = { txid: `direct:${'ab'.repeat(32)}`, seq: 4, mill: 'cd'.repeat(33) };
  const request: MakerRequest = { kind: 'tutor-ask', text: ASK, summary: SUMMARY, reference: 't1', who: 'kid-1', app_version: '0.1.0' };

  it('sends a grist of the maker-request grind with the request as its input, and answers its txid', async () => {
    const sendGrist = vi.fn<(params: SendGristParams) => Promise<typeof SENT>>(async () => SENT);
    const send = createMakerSender({ sendGrist, getKey: async () => key });

    const sent = await send(request);

    expect(sent).toEqual({ id: SENT.txid });
    expect(sendGrist).toHaveBeenCalledTimes(1);
    expect(sendGrist.mock.calls[0][0]).toMatchObject({ key, header: MAKER_REQUEST_GRIND, input: { schemaVersion: '1', ...request } });
    expect(MAKER_REQUEST_GRIND).toEqual({ app: 'spellforge', kind: 'maker-request', v: '1' });
  });

  it('with no key on the phone it says so and sends nothing', async () => {
    const sendGrist = vi.fn<(params: SendGristParams) => Promise<typeof SENT>>(async () => SENT);
    const send = createMakerSender({ sendGrist, getKey: async () => undefined });

    await expect(send(request)).rejects.toThrow(MakerRequestError);
    await expect(send(request)).rejects.toThrow(NO_KEY);
    expect(sendGrist).not.toHaveBeenCalled();
  });

  it('when the factory cannot be reached it says so in words for the screen', async () => {
    const sendGrist = vi.fn<(params: SendGristParams) => Promise<typeof SENT>>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const send = createMakerSender({ sendGrist, getKey: async () => key });

    await expect(send(request)).rejects.toBeInstanceOf(MakerRequestError);
  });
});
