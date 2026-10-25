// mw-79en7t.67 (Kestrel 13e): the front door's send to the tutor-talk grind. One turn is one grist: the request and up to three
// pictures go to the mill through sendGrist, the answer is polled for and checked against grinds/tutor-talk.answer.schema.json
// before anything is shown, and a send that fails, an answer that cannot be used or a mill that is too slow comes back as words
// the door can show. The grist and the reading of its answer are fakes here; tests never touch the network.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrivateKey } from '@bsv/sdk';
import { door } from 'bsv-kit/bsv';
import type { OutgoingPicture } from 'voice-kit/talks';
import { UploadTimeoutError } from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult, SendGristParams } from '../../src/grist';
import { NO_KEY } from '../../src/features/tutor/tutor-flow';
import {
  TUTOR_TALK_GRIND,
  TutorTalkError,
  createTutorTalkSend,
  isTutorTalkAnswer,
  type TutorTalkSendDeps,
} from '../../src/features/front-door/tutor-talk-send';
import type { TutorTalkAnswer } from '../../src/features/front-door/front-door-flow';
import type { TutorTalkRequest } from '../../src/features/front-door/tutor-talk-request';

const key = PrivateKey.fromRandom();
const SENT = { txid: `direct:${'ab'.repeat(32)}`, seq: 4, mill: 'cd'.repeat(33) };

const request: TutorTalkRequest = { schemaVersion: '1', message: 'Question 4', pictures: 3, history: [], strictness: 'meaning-gated' };
const picture = (name: string): OutgoingPicture => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', name });

type Read = NonNullable<TutorTalkSendDeps['read']>;
const answered = (answer: unknown): ReadAnswerResult<TutorTalkAnswer> =>
  ({ answer: { status: 'answered', answer: answer as TutorTalkAnswer }, next: 2 });
const pending: ReadAnswerResult<TutorTalkAnswer> = { pending: true, next: 1 };

function deps(over: Partial<TutorTalkSendDeps> = {}) {
  const sendGrist = vi.fn<(params: SendGristParams) => Promise<typeof SENT>>(async () => SENT);
  const read = vi.fn<Read>(async () => answered({ words: 'Which question is the hard one?' }));
  const all: TutorTalkSendDeps = {
    sendGrist,
    read,
    getKey: async () => key,
    shrink: async (blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type }),
    pollIntervalMs: 1,
    deadlineMs: 2000,
    ...over,
  };
  return { sendGrist, read, send: createTutorTalkSend(all) };
}

describe('the front door sends to the tutor-talk grind (mw-79en7t.67)', () => {
  it('AC1: a turn goes to sendGrist as a tutor-talk grist, the request as its input, and the answer comes back', async () => {
    const { sendGrist, read, send } = deps();

    const answer = await send(request, []);

    expect(answer).toEqual({ words: 'Which question is the hard one?' });
    expect(sendGrist).toHaveBeenCalledTimes(1);
    const params = sendGrist.mock.calls[0][0];
    expect(params.header).toEqual({ app: 'spellforge', kind: 'tutor-talk', v: '1' });
    expect(TUTOR_TALK_GRIND).toEqual(params.header);
    expect(params.input).toEqual(request);
    expect(params.key).toBe(key);
    expect(params.files).toBeUndefined();
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ key, txid: SENT.txid, mill: SENT.mill, since: SENT.seq }));
  });

  it('AC1: up to three pictures go as the grist\'s files, in order, under names the grind sees', async () => {
    const { sendGrist, send } = deps();

    await send(request, [picture('a.png'), picture('b.png'), picture('c.png')]);

    const files = sendGrist.mock.calls[0][0].files!;
    expect(files).toHaveLength(3);
    expect(files.map((file) => file.mime)).toEqual(['image/png', 'image/png', 'image/png']);
    expect(files.map((file) => file.name)).toEqual(['picture-1.png', 'picture-2.png', 'picture-3.png']);
    expect(Array.from(files[0].bytes)).toEqual([1, 2, 3]);
  });

  it('AC1: a photo too big to send is made smaller first', async () => {
    const shrink = vi.fn(async () => ({ bytes: new Uint8Array([9]), mime: 'image/jpeg' }));
    const { sendGrist, send } = deps({ shrink });

    await send(request, [picture('big.png')]);

    expect(shrink).toHaveBeenCalledTimes(1);
    expect(sendGrist.mock.calls[0][0].files).toEqual([{ bytes: new Uint8Array([9]), mime: 'image/jpeg', name: 'picture-1.jpg' }]);
  });

  it('AC1: a fourth picture is refused with words and nothing is sent', async () => {
    const { sendGrist, send } = deps();

    const refused = send(request, [picture('1.png'), picture('2.png'), picture('3.png'), picture('4.png')]);

    await expect(refused).rejects.toBeInstanceOf(TutorTalkError);
    await expect(refused).rejects.toThrow(/at most 3 pictures/);
    expect(sendGrist).not.toHaveBeenCalled();
  });

  it('polls until the mill has answered', async () => {
    const read = vi.fn<Read>().mockResolvedValueOnce(pending).mockResolvedValueOnce(pending).mockResolvedValue(answered({ words: 'Hello.' }));
    const { send } = deps({ read });

    expect(await send(request, [])).toEqual({ words: 'Hello.' });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('keeps polling through a read that fails, and answers when one gets through', async () => {
    const read = vi.fn<Read>().mockRejectedValueOnce(new door.BackendUnreachableError('offline')).mockResolvedValue(answered({ words: 'Back again.' }));
    const { send } = deps({ read });

    expect(await send(request, [])).toEqual({ words: 'Back again.' });
  });

  it('AC1: an answer that fails the answer schema is refused with words, not shown', async () => {
    for (const bad of [{ words: '' }, { speech: 'no words field' }, { words: 'Hi', surprise: true }, { words: 'Hi', world: 'art' }, 'just a string', null]) {
      const { send } = deps({ read: vi.fn<Read>(async () => answered(bad)) });
      const result = send(request, []);
      await expect(result).rejects.toBeInstanceOf(TutorTalkError);
      await expect(result).rejects.toThrow(/could not use|could not answer/);
    }
  });

  it('hands the mill the guard the device runs, the same one that refuses those answers', async () => {
    const { read, send } = deps();
    await send(request, []);
    const params = read.mock.calls[0][0] as ReadAnswerParams<TutorTalkAnswer>;
    expect(params.isAnswer).toBe(isTutorTalkAnswer);
  });

  it('AC1: a mill that fails or refuses says so, with its own reason kept off the screen', async () => {
    for (const status of ['failed', 'refused'] as const) {
      const read = vi.fn<Read>(async () => ({ answer: { status, reason: 'internal: model overloaded' }, next: 2 }));
      const { send } = deps({ read });
      const result = send(request, []);
      await expect(result).rejects.toBeInstanceOf(TutorTalkError);
      await expect(result).rejects.toThrow(/tutor could not answer/);
      await expect(result).rejects.not.toThrow(/overloaded/);
    }
  });

  it('AC1: a grist that cannot be sent says why', async () => {
    const cases: [unknown, RegExp][] = [
      [new door.BackendUnreachableError('offline'), /cannot be reached/],
      [new UploadTimeoutError(new door.ApiTimeoutError(true)), /took too long/],
      [new door.RefusedError(door.LICENCE_REQUIRED, 401), /no licence/],
    ];
    for (const [error, words] of cases) {
      const { send } = deps({ sendGrist: vi.fn(async () => { throw error; }) });
      const result = send(request, []);
      await expect(result).rejects.toBeInstanceOf(TutorTalkError);
      await expect(result).rejects.toThrow(words);
    }
  });

  it('AC1: a grist that is never answered says it took too long once the deadline passes', async () => {
    const read = vi.fn<Read>(async () => pending);
    const { send } = deps({ read, deadlineMs: 30 });

    const result = send(request, []);

    await expect(result).rejects.toBeInstanceOf(TutorTalkError);
    await expect(result).rejects.toThrow(/took too long to answer/);
    expect(read.mock.calls.length).toBeGreaterThan(1);
  });

  it('a device with no key says so and sends nothing', async () => {
    const { sendGrist, send } = deps({ getKey: async () => undefined });

    const result = send(request, []);

    await expect(result).rejects.toThrow(NO_KEY);
    await expect(result).rejects.toBeInstanceOf(TutorTalkError);
    expect(sendGrist).not.toHaveBeenCalled();
  });
});

describe('isTutorTalkAnswer is the answer schema (grinds/tutor-talk.answer.schema.json)', () => {
  const schema = JSON.parse(readFileSync(join(process.cwd(), 'grinds/tutor-talk.answer.schema.json'), 'utf8')) as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, unknown>;
  };

  it('knows every field the schema names, and no others', () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['words']);
    for (const field of Object.keys(schema.properties).filter((name) => name !== 'words')) {
      expect(isTutorTalkAnswer({ words: 'Hi', [field]: undefined }), field).toBe(true);
    }
    expect(isTutorTalkAnswer({ words: 'Hi', nope: 1 })).toBe(false);
  });

  it('takes a full answer', () => {
    expect(
      isTutorTalkAnswer({
        words: 'Spelling it is.',
        profile_update: { age: 13, gender: 'boy', experience: 'some', learnerKind: 'quick', speed: 'steady', notes: ['likes dragons'], guessed: ['age'] },
        goal_suggestion: { id: 'spell-it', why: 'you said so' },
        world: 'spelling',
        memory_update: { add: ['likes dragons'], remove: ['old'], summary: 'so far' },
        form_values: [{ field: 'name', value: 'Sam' }],
        form_ask: 'name',
      }),
    ).toBe(true);
  });

  it('refuses what the schema refuses', () => {
    const refused: unknown[] = [
      { words: 'x'.repeat(1001) },
      { words: 'Hi', world: 'art' },
      { words: 'Hi', profile_update: { age: 0 } },
      { words: 'Hi', profile_update: { age: 1.5 } },
      { words: 'Hi', profile_update: { gender: 'other' } },
      { words: 'Hi', profile_update: { speed: 'zoom' } },
      { words: 'Hi', profile_update: { notes: ['a', 'b', 'c', 'd'] } },
      { words: 'Hi', profile_update: { guessed: ['colour'] } },
      { words: 'Hi', profile_update: { extra: 1 } },
      { words: 'Hi', goal_suggestion: { id: 'a' } },
      { words: 'Hi', goal_suggestion: { id: 'a', why: 'b'.repeat(201) } },
      { words: 'Hi', memory_update: { add: Array.from({ length: 6 }, () => 'x') } },
      { words: 'Hi', memory_update: { summary: 's'.repeat(1501) } },
      { words: 'Hi', form_values: [{ field: 'name' }] },
      { words: 'Hi', form_values: Array.from({ length: 9 }, () => ({ field: 'a', value: 'b' })) },
      { words: 'Hi', form_ask: '' },
      [],
    ];
    for (const value of refused) expect(isTutorTalkAnswer(value), JSON.stringify(value)).toBe(false);
  });
});
