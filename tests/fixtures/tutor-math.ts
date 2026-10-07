// A maths tutor session for the tests: the problem, the answer to it (which must never reach the screen), the
// factory's answers by action, and a whole recorded session (two scoring engines, one stale turn, parent notes).
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { ReadingResult, TutorAnswer, TutorReadingResult, TutorSession, TutorStrictness } from '../../src/contracts';

export const MATH_PROBLEM = 'Anna has 3 apples and buys 4 more. How many apples does she have now?';
/** The answer to MATH_PROBLEM: a test greps the screen for it. */
export const EXPECTED_ANSWER = '7';

export const mathAnswer = (over: Partial<TutorAnswer> = {}): TutorAnswer => ({
  action: 'math_probe',
  focus_words: [],
  prompt_to_child: 'Look at what Anna starts with. What happens when she buys more?',
  layer_diagnosis: 'math',
  math_diagnosis: {
    where_wrong: 'you took the apples away instead of putting them together',
    gap: 'knowing that buying more means adding',
    method: 'counting on from the bigger number',
  },
  ...over,
});

const words = (engine: string): ReadingResult => ({
  engine,
  accuracy: engine === 'azure' ? 88 : 91,
  seconds: 4.2,
  words: [
    { text: 'Anna', expected_phonemes: ['a', 'n', 'a'], produced_phonemes: ['a', 'n', 'a'], error: 'none', accuracy: 98, self_corrected: false },
    { text: 'apples', expected_phonemes: ['a', 'p', 'l', 'z'], produced_phonemes: ['a', 'p', 'z'], error: 'mispronunciation', accuracy: engine === 'azure' ? 52 : 61, self_corrected: false },
  ],
});

export const BOTH_ENGINES: TutorReadingResult = { azure: words('azure'), local: words('local') };

/** A fixed start so every time in the record is known. */
export const T0 = new Date('2026-10-07T09:00:00.000Z');
export const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

/**
 * A whole session as the record screen shows it:
 *   1 problem-in  answered after 3 s
 *   2 reading     answered after 12 s, azure and local both scored
 *   3 reading     answered after 30 s, but he had moved on: stale
 *   4 reading     answered after 5 s (continue)
 *   5 math        typed 8 and a photo work-1.jpg, answered after 20 s: parent notes and recommendations
 */
export async function seedRecordedSession(profileId: string, strictness: TutorStrictness = 'meaning-gated'): Promise<{ session: TutorSession; audioBlobId: string; photoBlobId: string }> {
  const session = await tutorRepo.createSession({ profileId, strictness, problemKind: 'word', targetText: MATH_PROBLEM });
  await db.tutorSessions.update(session.id, { startedAt: T0 });
  const audio = await tutorRepo.putBlob({ bytes: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/webm', name: 'reading-1.webm' });
  const photo = await tutorRepo.putBlob({ bytes: new Uint8Array([255, 216, 1]).buffer, mime: 'image/jpeg', name: 'work-1.jpg' });

  const add = async (turn: Parameters<typeof tutorRepo.addTurn>[0], txid: string, answer: TutorAnswer, seconds: number, readingResult?: TutorReadingResult, stale = false) => {
    const added = await tutorRepo.addTurn({ ...turn, sentAt: turn.sentAt });
    await tutorRepo.markSent(added.id, { txid, seq: 1, mill: 'aa' });
    if (stale) await tutorRepo.moveOn(session.id, added.index);
    await tutorRepo.applyAnswer(txid, { status: 'answered', answer, ...(readingResult ? { readingResult } : {}) }, new Date((turn.sentAt as Date).getTime() + seconds * 1000));
    return added;
  };
  const base = { sessionId: session.id, strictness };
  await add({ sessionId: session.id, mode: 'problem-in', request: { mode: 'problem-in', ...base, target_text: MATH_PROBLEM, session_history: [] }, sentAt: at(0) }, 't1', mathAnswer({ action: 'continue', layer_diagnosis: 'none', math_diagnosis: undefined, prompt_to_child: 'Here is your problem.', target_text: MATH_PROBLEM, problem_kind: 'word' }), 3);
  await add({ sessionId: session.id, mode: 'reading', request: { mode: 'reading', strictness, target_text: MATH_PROBLEM, session_history: [] }, attachments: [{ kind: 'audio', blobId: audio.id }], sentAt: at(10) }, 't2', mathAnswer({ action: 'reread_word', layer_diagnosis: 'reading', math_diagnosis: undefined, focus_words: [{ word: 'apples', chunks: ['ap', 'ples'] }], prompt_to_child: 'Try that word again.' }), 12, BOTH_ENGINES);
  await add({ sessionId: session.id, mode: 'reading', request: { mode: 'reading', strictness, target_text: MATH_PROBLEM, session_history: [] }, attachments: [], sentAt: at(40) }, 't3', mathAnswer({ action: 'encourage', layer_diagnosis: 'reading', math_diagnosis: undefined, prompt_to_child: 'LATE ENCOURAGEMENT' }), 30, undefined, true);
  await add({ sessionId: session.id, mode: 'reading', request: { mode: 'reading', strictness, target_text: MATH_PROBLEM, session_history: [] }, attachments: [], sentAt: at(80) }, 't4', mathAnswer({ action: 'continue', layer_diagnosis: 'none', math_diagnosis: undefined, prompt_to_child: 'Nice reading.', notes_for_parent: 'Reads short words well; long ones need chunking.' }), 5);
  await add(
    { sessionId: session.id, mode: 'math', request: { mode: 'math', strictness, target_text: MATH_PROBLEM, child_answer: '8', work_photo: true, session_history: [] }, attachments: [{ kind: 'work', blobId: photo.id }], sentAt: at(100) },
    't5',
    mathAnswer({
      notes_for_parent: 'Subtracts when the story says "buys more".',
      recommendations_for_parent: [{ what: 'Act the story out with real fruit', why: 'makes "more" something he can see', where: 'at the kitchen table' }],
    }),
    20,
  );
  return { session, audioBlobId: audio.id, photoBlobId: photo.id };
}
