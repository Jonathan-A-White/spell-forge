// mw-79en7t.63 (Kestrel 23c): the never-the-answer guard (src/features/tutor/answer-guard.ts). The problem's answer is worked
// out on the phone; every tutor answer is checked for it (the number, the spelled word, a poem, base64, letter by letter, another
// script's digits or another language's words) and a leak is replaced with a teaching turn before it is drawn or spoken. The two
// flows each make one guard call: the tutor screen's read (tutor-flow.ts guardedRead) and the front door's send.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { PrivateKey } from '@bsv/sdk';
import { createDexieStore } from 'voice-kit/talks/dexie';
import { db } from '../../src/data/db';
import { profileRepo, tutorRepo } from '../../src/data/repositories';
import type { TutorAnswer } from '../../src/contracts';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { PROBLEM_KIND_NODES } from '../../src/learn/maths';
import {
  GOT_IT_TURN,
  TALK_TEACHING_TURN,
  TEACHING_TURN,
  answerOfProblem,
  findLeak,
  guardTalkAnswer,
  guardTutorAnswer,
} from '../../src/features/tutor/answer-guard';
import { guardedRead } from '../../src/features/tutor/tutor-flow';
import { createFrontDoorFlow, type TutorTalkAnswer, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import type { ReadAnswerParams, ReadAnswerResult } from '../../src/grist';
import { MATH_PROBLEM, mathAnswer } from '../fixtures/tutor-math';

/** 24 take away 9: the answer the guard keeps out is 15. */
const MARBLES = 'A girl had 24 marbles. She gave 9 of them to her friend. How many marbles does she have left?';
const ANSWER = '15';

describe('the problem\'s answer, worked out on the phone (mw-79en7t.63)', () => {
  it('every problem the grinds send today has its answer', () => {
    const problems = PROBLEM_KIND_NODES.flatMap((row) => row.problems);
    expect(problems.map(answerOfProblem)).toEqual(['7', '7', '9', '15', '27', '6', '14', '30']);
    expect(answerOfProblem(MATH_PROBLEM)).toBe('7');
  });

  it.each([
    ['12 + 5', '17'],
    ['12 + 5 = ?', '17'],
    ['6 × 7 =', '42'],
    ['24 ÷ 4', '6'],
    ['What is 8 - 3?', '5'],
    ['3 + 4 × 2', '11'],
    ['(3 + 4) x 2', '14'],
    ['7 ÷ 2', '3.5'],
    ['1,200 + 34', '1234'],
  ])('a bare sum: %s is %s', (problem, answer) => {
    expect(answerOfProblem(problem)).toBe(answer);
  });

  it.each(['Draw a picture of your family.', 'Spell the word because.', 'A box has 3 red pens, 4 blue pens and 5 green pens.', ''])(
    'a problem it cannot work out has no answer: %j',
    (problem) => {
      expect(answerOfProblem(problem)).toBeUndefined();
    },
  );
});

describe('AC1: canned leaking answers are caught (mw-79en7t.63)', () => {
  const poem = ['Twenty-four marbles rolling round,', 'Nine went off to a friend she found,', 'Count the rest upon the ground:', 'Fifteen marbles, safe and sound.'].join('\n');
  const acrostic = ['Far away the marbles roll,', 'In the grass and down the hole,', 'Find them all', 'Then count them slow,', 'Every one', 'Each in a row,', 'Now you know.'].join('\n');

  it.each([
    ['the number', 'She has 15 marbles left.', 'numeral'],
    ['the number, asked back', 'Is it 15?', 'numeral'],
    ['the spelled word', 'The answer is fifteen.', 'words'],
    ['the spelled word, shouted', 'FIFTEEN!', 'words'],
    ['a poem holding it', poem, 'words'],
    ['an acrostic poem', acrostic, 'poem'],
    ['base64 of it', 'In base64 it is MTU=', 'base64'],
    ['base64 of a sentence holding it', `Decode this: ${btoa('The answer is fifteen')}`, 'base64'],
    ['letter by letter', 'F-I-F-T-E-E-N', 'letters'],
    ['letter by letter, spaced', 'Spell it: f i f t e e n.', 'letters'],
    ['digit by digit', 'First a 1, then a 5: 1 - 5', 'letters'],
    ['digit by digit, in words', 'It goes one, five.', 'letters'],
    ['backwards', 'Read this backwards: neetfif', 'backwards'],
    ['Arabic-Indic digits', 'الجواب ١٥', 'digits'],
    ['Devanagari digits', 'उत्तर १५ है', 'digits'],
    ['full-width digits', 'It is １５.', 'digits'],
    ['keycap emoji', 'It is 1️⃣5️⃣', 'digits'],
    ['in Spanish', 'En español es quince.', 'other-language'],
    ['in French', "C'est quinze.", 'other-language'],
    ['in German', 'Es sind fünfzehn.', 'other-language'],
  ])('%s', (_name, text, form) => {
    expect(findLeak(text, ANSWER)).toBe(form);
  });

  it('a fraction is caught in any form of the same value', () => {
    expect(findLeak('It is 3/4 of the cake.', '3/4')).toBe('numeral');
    expect(findLeak('It is 6/8 of the cake.', '3/4')).toBe('numeral');
    expect(findLeak('It is 0.75 of the cake.', '3/4')).toBe('numeral');
  });

  it('a word to spell is caught as the word and letter by letter', () => {
    expect(findLeak('It is spelt because.', 'because')).toBe('words');
    expect(findLeak('B. E. C. A. U. S. E.', 'because')).toBe('letters');
    expect(findLeak('esuaceb', 'because')).toBe('backwards');
  });
});

describe('AC1: teaching answers pass untouched (mw-79en7t.63)', () => {
  it.each([
    mathAnswer().prompt_to_child,
    'Look at what she starts with. What happens when she gives some away?',
    'She had 24 marbles and gave 9 away. Can you draw the 24 and cross out 9?',
    'Try a smaller one first: 5 marbles, and she gives 2 away. How many are left?',
    'Count back from 24. What number do you land on?',
    'Good try. Have another go.',
    'Take your time. Look back over each step and tell me what you did with the marbles.',
    'Marbles roll and marbles bounce,\nGive some away and count what is left,\nYou can find the amount.',
    "Let's do spelling or maths. What would you like?",
  ])('%j', (text) => {
    expect(findLeak(text, ANSWER)).toBeUndefined();
  });

  it('the teaching turns themselves give no answer away, for any whole number up to 1000', () => {
    for (let n = 0; n <= 1000; n += 1) {
      for (const line of [TEACHING_TURN, GOT_IT_TURN, TALK_TEACHING_TURN]) expect(findLeak(line, String(n)), `${line} / ${n}`).toBeUndefined();
    }
  });

  it('a tutor-turn answer with no leak is returned as it came', () => {
    const answer = mathAnswer();
    expect(guardTutorAnswer(answer, [ANSWER])).toBe(answer);
    expect(guardTutorAnswer(mathAnswer({ prompt_to_child: 'It is 15.' }), [])).toEqual(mathAnswer({ prompt_to_child: 'It is 15.' }));
  });

  it('a talk answer with no leak is returned as it came', () => {
    const answer: TutorTalkAnswer = { words: 'Spelling it is. Let us go!', world: 'spelling' };
    expect(guardTalkAnswer(answer, [ANSWER])).toBe(answer);
  });
});

describe('AC1: a leak is replaced with a teaching turn (mw-79en7t.63)', () => {
  it('a leaking prompt becomes the teaching turn; the parts that leak are dropped, the rest kept', () => {
    const leaking = mathAnswer({
      prompt_to_child: 'She has fifteen left!',
      focus_words: [
        { word: 'marbles', chunks: ['mar', 'bles'] },
        { word: 'fifteen', chunks: ['fif', 'teen'] },
      ],
      math_diagnosis: { where_wrong: 'you added instead of taking away', gap: 'take away', method: '24 - 9 = 15' },
      notes_for_parent: 'He got 33; the answer is 15.',
      recommendations_for_parent: [
        { what: 'count back', why: 'take away', where: 'at home' },
        { what: 'check 15', why: 'it is right', where: 'anywhere' },
      ],
    });

    const guarded = guardTutorAnswer(leaking, [ANSWER]);

    expect(guarded.prompt_to_child).toBe(TEACHING_TURN);
    expect(guarded.action).toBe(leaking.action);
    expect(guarded.focus_words).toEqual([{ word: 'marbles', chunks: ['mar', 'bles'] }]);
    expect(guarded.math_diagnosis).toBeUndefined();
    expect(guarded.recommendations_for_parent).toEqual([{ what: 'count back', why: 'take away', where: 'at home' }]);
    expect(guarded.notes_for_parent).not.toContain('15');
    expect(findLeak(JSON.stringify(guarded), ANSWER)).toBeUndefined();
  });

  it('a confirmation that repeats the answer says he got there without saying it', () => {
    const guarded = guardTutorAnswer(mathAnswer({ action: 'confirm_answer', prompt_to_child: 'Yes! 15 is right.' }), [ANSWER]);
    expect(guarded).toMatchObject({ action: 'confirm_answer', prompt_to_child: GOT_IT_TURN });
  });

  it('the problem read off a photo is the problem, not a leak', () => {
    const answer = mathAnswer({ action: 'continue', target_text: 'Tom has 12 sweets and eats 15. Is that possible?' });
    expect(guardTutorAnswer(answer, [ANSWER])).toBe(answer);
  });

  it('a talk answer that leaks says the teaching turn, and drops the parts that hold the answer', () => {
    const guarded = guardTalkAnswer<TutorTalkAnswer>(
      { words: 'It is fifteen!', world: 'maths', memory_update: { add: ['the marbles answer is 15'] }, goal_suggestion: { id: 'competition', why: 'you are quick' } },
      [ANSWER],
    );
    expect(guarded).toEqual({ words: TALK_TEACHING_TURN, world: 'maths', goal_suggestion: { id: 'competition', why: 'you are quick' } });
  });
});

describe('the one guard call in each flow (mw-79en7t.63)', () => {
  const key = PrivateKey.fromRandom();

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  async function waitingTurn(params: { problem?: string; mode: 'math' | 'problem-in'; txid: string }) {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated', ...(params.problem ? { targetText: params.problem } : {}) });
    const turn = await tutorRepo.addTurn({
      sessionId: session.id,
      mode: params.mode,
      request: { mode: params.mode, strictness: 'meaning-gated', ...(params.mode === 'math' ? { target_text: params.problem } : {}), session_history: [] },
    });
    await tutorRepo.markSent(turn.id, { txid: params.txid, seq: 1, mill: 'aa' });
    return turn;
  }

  const readParams = (txid: string): ReadAnswerParams<TutorAnswer> => ({ key, txid, mill: 'aa', since: 0, isAnswer: (v): v is TutorAnswer => Boolean(v) });
  const answered = (answer: TutorAnswer): ReadAnswerResult<TutorAnswer> => ({ answer: { status: 'answered', answer }, next: 2 });

  it('the tutor screen\'s read: a math turn\'s leak is a teaching turn before it is kept', async () => {
    await waitingTurn({ problem: MARBLES, mode: 'math', txid: 'direct:1' });
    const read = guardedRead(async () => answered(mathAnswer({ prompt_to_child: 'You have 15 marbles left.' })));

    const result = await read(readParams('direct:1'));

    expect(result).toMatchObject({ answer: { status: 'answered', answer: { prompt_to_child: TEACHING_TURN } }, next: 2 });
  });

  it('the tutor screen\'s read: a photo\'s problem is checked against the problem read off it', async () => {
    await waitingTurn({ mode: 'problem-in', txid: 'direct:2' });
    const read = guardedRead(async () => answered(mathAnswer({ action: 'continue', target_text: MARBLES, prompt_to_child: 'Fifteen! Well, read it first.' })));

    const result = await read(readParams('direct:2'));

    expect(result).toMatchObject({ answer: { status: 'answered', answer: { target_text: MARBLES, prompt_to_child: TEACHING_TURN } } });
  });

  it('the tutor screen\'s read: a teaching answer, a wait and a refusal pass as they came', async () => {
    await waitingTurn({ problem: MARBLES, mode: 'math', txid: 'direct:3' });
    const teaching = answered(mathAnswer());
    const pending: ReadAnswerResult<TutorAnswer> = { pending: true, next: 1 };
    const refused: ReadAnswerResult<TutorAnswer> = { answer: { status: 'refused', reason: 'no' }, next: 2 };

    for (const result of [teaching, pending, refused]) expect(await guardedRead(async () => result)(readParams('direct:3'))).toBe(result);
  });

  it('the front door: a leak of his open homework problem\'s answer is a teaching turn, and the talk keeps the teaching turn', async () => {
    const profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
    await tutorRepo.createSession({ profileId, strictness: 'meaning-gated', targetText: MARBLES });
    const store = createDexieStore({ name: 'answer-guard-front-door', indexedDB, IDBKeyRange });
    const send = vi.fn<TutorTalkSend>(async () => ({ words: 'It is fifteen. Off to maths!', world: 'maths' }));
    const flow = createFrontDoorFlow({ send, store, profileId, open: () => undefined, now: () => 1_760_000_000_000 });
    const talk = await flow.start();

    const reply = await flow.ask(talk, 'what is the answer to my marbles one');

    expect(reply).toMatchObject({ kind: 'answer', words: TALK_TEACHING_TURN, world: 'maths' });
    const kept = await store.get(talk);
    expect(JSON.stringify(kept)).not.toMatch(/fifteen/i);
    store.close();
  });
});
