// mw-kuy7rx.12: the request a parent's question becomes: the question, and the last 20 sessions as compact text.
import { beforeEach, describe, expect, it } from 'vitest';
import type { TutorTurn } from '../../src/contracts/types';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import { PARENT_ASK_MAX_QUESTION, PARENT_ASK_SESSIONS, buildParentAskRequest, buildParentAskRequestFor } from '../../src/features/tutor';
import type { SessionWithTurns } from '../../src/features/tutor';
import { mathFound, readRight, session, stopped, turn } from '../fixtures/parent-sessions';

const withAnswer = (t: TutorTurn, answer: Partial<NonNullable<TutorTurn['answer']>>): TutorTurn => ({
  ...t,
  answer: { action: 'continue', focus_words: [], prompt_to_child: 'ok', layer_diagnosis: 'none', ...t.answer, ...answer },
});

const mathWithNotes: SessionWithTurns = {
  session: mathFound.session,
  turns: [
    mathFound.turns[0],
    withAnswer(mathFound.turns[1], {
      math_diagnosis: { where_wrong: 'carried the wrong digit', gap: 'place value of tens', method: 'partial products' },
      notes_for_parent: 'He mixed up the tens when carrying.',
    }),
  ],
};

describe('buildParentAskRequest', () => {
  it('carries the question, trimmed, and the sessions newest first', () => {
    const request = buildParentAskRequest('  How is he doing with reading?  ', [stopped, readRight, mathWithNotes]);
    expect(request.question).toBe('How is he doing with reading?');
    expect(request.sessions).toHaveLength(3);
    expect(request.sessions[0]).toContain('2025-10-07');
    expect(request.sessions[1]).toContain('2025-10-06');
    expect(request.sessions[2]).toContain('2025-10-05');
  });

  it('puts the problem, the misread words, how the maths went and the tutor\'s notes in a session\'s summary', () => {
    const [summary] = buildParentAskRequest('q', [mathWithNotes]).sessions;
    expect(summary).toContain('What is 12 times 4?');
    expect(summary).toContain('carried the wrong digit');
    expect(summary).toContain('place value of tens');
    expect(summary).toContain('He mixed up the tens when carrying.');

    const [reading] = buildParentAskRequest('q', [readRight]).sessions;
    expect(reading).toContain('The fiend read the chapter aloud');
    expect(reading).toMatch(/misread words:.*fiend/i);
    expect(reading).toMatch(/misread words:.*chapter/i);
    expect(reading).not.toMatch(/misread words:.*\bThe\b/);
  });

  it('names a word once, however many turns misread it, and adds the focus words the tutor chose', () => {
    const row: SessionWithTurns = {
      session: stopped.session,
      turns: [
        stopped.turns[0],
        turn('s3', 2, 'reading', '2025-10-05T10:04:00Z', { action: 'reread_word', words: [{ ...stopped.turns[0].readingResult!.azure!.words[0] }] }),
        withAnswer(turn('s3', 3, 'reading', '2025-10-05T10:05:00Z', { action: 'reread_word' }), { focus_words: [{ word: 'Two', chunks: ['two'] }] }),
      ],
    };
    const [summary] = buildParentAskRequest('q', [row]).sessions;
    expect(summary.match(/chapter/gi)).toHaveLength(2); // once in the problem text, once as a misread word
    expect(summary).toMatch(/misread words:.*two/i);
  });

  it('keeps only the last 20 sessions, and skips a session with no turns', () => {
    const rows: SessionWithTurns[] = Array.from({ length: 25 }, (_, i) => {
      const id = `x${i}`;
      const day = String(i + 1).padStart(2, '0');
      return {
        session: session(id, `2025-09-${day}T10:00:00Z`, { targetText: `Problem number ${i}` }),
        turns: [turn(id, 1, 'reading', `2025-09-${day}T10:01:00Z`, { action: 'continue' })],
      };
    });
    rows.push({ session: session('empty', '2025-10-01T10:00:00Z', { targetText: 'Nothing happened' }), turns: [] });
    const { sessions } = buildParentAskRequest('q', rows);
    expect(sessions).toHaveLength(PARENT_ASK_SESSIONS);
    expect(PARENT_ASK_SESSIONS).toBe(20);
    expect(sessions.join('\n')).not.toContain('Nothing happened');
    expect(sessions[0]).toContain('Problem number 24');
    expect(sessions[19]).toContain('Problem number 5');
    expect(sessions.join('\n')).not.toContain('Problem number 4');
  });

  it('sends no sessions when there are none, and cuts an over-long question', () => {
    expect(buildParentAskRequest('q', []).sessions).toEqual([]);
    expect(buildParentAskRequest('x'.repeat(PARENT_ASK_MAX_QUESTION + 50), []).question).toHaveLength(PARENT_ASK_MAX_QUESTION);
  });

  it('sends no names, ids or keys: only the question and text summaries', () => {
    const request = buildParentAskRequest('q', [readRight]);
    expect(Object.keys(request).sort()).toEqual(['question', 'sessions']);
    expect(JSON.stringify(request)).not.toContain('s1');
    expect(JSON.stringify(request)).not.toContain('p1');
  });
});

describe('buildParentAskRequestFor', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('reads the profile\'s own sessions and turns from the store', async () => {
    const mine = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated', problemKind: 'plain', targetText: 'What is 7 times 8?' });
    const turn = await tutorRepo.addTurn({ sessionId: mine.id, mode: 'math', request: { mode: 'math', strictness: 'meaning-gated', session_history: [] } });
    expect(turn.index).toBe(1);
    const other = await tutorRepo.createSession({ profileId: 'p2', strictness: 'meaning-gated', targetText: 'Somebody else\'s problem' });
    await tutorRepo.addTurn({ sessionId: other.id, mode: 'reading', request: { mode: 'reading', strictness: 'meaning-gated', session_history: [] } });

    const request = await buildParentAskRequestFor('p1', 'Is he fast at times tables?');
    expect(request.question).toBe('Is he fast at times tables?');
    expect(request.sessions).toHaveLength(1);
    expect(request.sessions[0]).toContain('What is 7 times 8?');
  });
});
