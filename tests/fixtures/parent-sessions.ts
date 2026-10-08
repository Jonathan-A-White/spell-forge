// Fixture tutor sessions for the Grown-ups screen's 'This week' and 'Sessions' (mw-kuy7rx.3).
import type { ReadingResult, ReadingWord, TutorAnswer, TutorAnswerAction, TutorMode, TutorSession, TutorTurn } from '../../src/contracts/types';

/** Wednesday 8 Oct 2025, noon UTC: the "now" of the fixtures. */
export const NOW = new Date('2025-10-08T12:00:00Z');

export const at = (iso: string) => new Date(iso);

export function session(id: string, startedAt: string, extra: Partial<TutorSession> = {}): TutorSession {
  return { id, profileId: 'p1', startedAt: at(startedAt), strictness: 'meaning-gated', status: 'ended', ...extra };
}

export function word(text: string, error: ReadingWord['error'] = 'none'): ReadingWord {
  return { text, expected_phonemes: [], produced_phonemes: [], error, accuracy: error === 'none' ? 100 : 40, self_corrected: false };
}

export function reading(engine: string, words: ReadingWord[]): ReadingResult {
  return { engine, words, accuracy: 70, seconds: 4 };
}

function answer(action: TutorAnswerAction): TutorAnswer {
  return { action, focus_words: [], prompt_to_child: 'Well done', layer_diagnosis: 'none' };
}

export function turn(
  sessionId: string,
  index: number,
  mode: TutorMode,
  sentAt: string,
  extra: { action?: TutorAnswerAction; status?: TutorTurn['status']; words?: ReadingWord[]; answeredAt?: string } = {},
): TutorTurn {
  const status = extra.status ?? (extra.action ? 'answered' : 'failed');
  return {
    id: `${sessionId}-t${index}`,
    sessionId,
    index,
    mode,
    sentAt: at(sentAt),
    ...(extra.answeredAt ? { answeredAt: at(extra.answeredAt) } : {}),
    request: { mode, strictness: 'meaning-gated', session_history: [] },
    attachments: [],
    status,
    ...(extra.action ? { answer: answer(extra.action) } : {}),
    ...(extra.words ? { readingResult: { azure: reading('azure', extra.words) } } : {}),
  };
}

/** Tue 7 Oct: a reading session read right on the 2nd try (20 minutes), 'chapter' and 'fiend' misread on the 1st. */
export const readRight = {
  session: session('s1', '2025-10-07T09:00:00Z', {
    endedAt: at('2025-10-07T09:20:00Z'),
    problemKind: 'word',
    targetText: 'The fiend read the chapter aloud to everyone in the room',
  }),
  turns: [
    turn('s1', 1, 'problem-in', '2025-10-07T09:00:00Z', { action: 'continue' }),
    turn('s1', 2, 'reading', '2025-10-07T09:05:00Z', { action: 'reread_word', words: [word('The'), word('fiend', 'mispronunciation'), word('chapter', 'omission')] }),
    turn('s1', 3, 'reading', '2025-10-07T09:12:00Z', { action: 'done', words: [word('The'), word('fiend'), word('chapter')] }),
  ],
};

/** Mon 6 Oct: a maths session whose answer was found (10 minutes). */
export const mathFound = {
  session: session('s2', '2025-10-06T16:00:00Z', {
    endedAt: at('2025-10-06T16:10:00Z'),
    problemKind: 'plain',
    targetText: 'What is 12 times 4?',
  }),
  turns: [
    turn('s2', 1, 'problem-in', '2025-10-06T16:00:00Z', { action: 'continue' }),
    turn('s2', 2, 'math', '2025-10-06T16:06:00Z', { action: 'confirm_answer' }),
  ],
};

/** Sun 5 Oct: a session he left (5 minutes), 'chapter' misread again. */
export const stopped = {
  session: session('s3', '2025-10-05T10:00:00Z', {
    endedAt: at('2025-10-05T10:05:00Z'),
    problemKind: 'word',
    targetText: 'Chapter two',
  }),
  turns: [turn('s3', 1, 'reading', '2025-10-05T10:02:00Z', { action: 'reread_word', words: [word('Chapter', 'mispronunciation'), word('two')] })],
};

/** Mon 22 Sep: more than a week ago; counts in no 'This week'. */
export const old = {
  session: session('s4', '2025-09-22T10:00:00Z', { endedAt: at('2025-09-22T10:30:00Z'), problemKind: 'word', targetText: 'An old problem' }),
  turns: [turn('s4', 1, 'reading', '2025-09-22T10:02:00Z', { action: 'reread_word', words: [word('old', 'omission')] })],
};
