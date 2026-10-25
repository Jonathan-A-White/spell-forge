// Kestrel 19c (mw-79en7t.59): the homework picture. The maths loop lives in the maths world (src/worlds/maths/homework.tsx) and its turn
// names the node of the maths graph it is about; the request carries it, and the node a turn names is checked against the graph. With
// no licence the homework picture shows the gate's one line and no grind call is made. A fake grind stands in for the mill.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { PrivateKey } from '@bsv/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TutorAnswer, TutorTurn } from '../../src/contracts';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import { TutorUserError, homeworkNode, nodeForProblem, sendMath } from '../../src/features/tutor/tutor-flow';
import type { TutorDeps } from '../../src/features/tutor/tutor-flow';
import { MATHS_NODES, PROBLEM_KIND_NODES } from '../../src/learn/maths';
import { TUTOR_TURN_GRIND } from '../../src/grist';
import type { SendGristParams } from '../../src/grist';
import { NO_LICENCE_LINE, setLicenceStatus } from '../../src/shell/licence-gate';
import { Homework } from '../../src/worlds/maths/homework';

const key = PrivateKey.fromRandom();
const PROBLEM = PROBLEM_KIND_NODES[1].problems[1]; // the library books: subtract-two-digit
const PROBLEM_NODE = PROBLEM_KIND_NODES[1].node;
const onGraph = (id: string | undefined) => MATHS_NODES.some((node) => node.id === id);

const answer: TutorAnswer = {
  action: 'math_probe',
  focus_words: [],
  prompt_to_child: 'Look at the ones column. Which number is bigger there?',
  layer_diagnosis: 'math',
};

function fakeGrind() {
  const grind = {
    sends: [] as SendGristParams[],
    sendGrist: undefined as unknown as NonNullable<TutorDeps['sendGrist']>,
  };
  grind.sendGrist = vi.fn(async (params: SendGristParams) => {
    grind.sends.push(params);
    return { txid: `direct:${grind.sends.length}`, seq: 1, mill: 'aa' };
  });
  return grind;
}

const shrink = async (blob: Blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', name: 'photo.jpg' });
const deps = (grind: ReturnType<typeof fakeGrind>): TutorDeps => ({
  sendGrist: grind.sendGrist,
  getKey: async () => key,
  shrink,
  say: async () => undefined,
  pollIntervalMs: 20,
});

async function newSession() {
  return tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated', problemKind: 'word', targetText: PROBLEM });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  setLicenceStatus(undefined);
});
afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describe('the node a homework picture is about', () => {
  it('knows the node of a problem the graph is shown, and none for a problem it has not seen', () => {
    expect(nodeForProblem(PROBLEM)).toBe(PROBLEM_NODE);
    expect(onGraph(nodeForProblem(PROBLEM))).toBe(true);
    expect(nodeForProblem('What is the capital of France?')).toBeUndefined();
  });

  it('sends a homework picture with the node in the request, beside the photo of his work', async () => {
    const grind = fakeGrind();
    const session = await newSession();
    const turn = await sendMath({ session, targetText: PROBLEM, photo: new Blob([new Uint8Array([1, 2, 3])]), node: PROBLEM_NODE }, deps(grind));
    expect(grind.sends).toHaveLength(1);
    expect(grind.sends[0].header).toEqual(TUTOR_TURN_GRIND);
    expect(grind.sends[0].input).toMatchObject({ mode: 'math', work_photo: true, node: PROBLEM_NODE });
    expect(turn.request.node).toBe(PROBLEM_NODE);
    expect(homeworkNode(turn)).toBe(PROBLEM_NODE);
  });

  it('refuses to name a node the graph does not hold: the request carries none', async () => {
    const grind = fakeGrind();
    const session = await newSession();
    const turn = await sendMath({ session, targetText: PROBLEM, answer: '33', node: 'not-a-node' }, deps(grind));
    expect(grind.sends[0].input).not.toHaveProperty('node');
    expect(turn.request.node).toBeUndefined();
    expect(homeworkNode(turn)).toBeUndefined();
  });

  it('checks the node of an answered turn against the graph', async () => {
    const session = await newSession();
    const turn = await sendMath({ session, targetText: PROBLEM, answer: '33', node: PROBLEM_NODE }, deps(fakeGrind()));
    await tutorRepo.applyAnswer(turn.txid as string, { status: 'answered', answer });
    const answered = (await tutorRepo.getTurn(turn.id)) as TutorTurn;
    expect(answered.status).toBe('answered');
    expect(homeworkNode(answered)).toBe(PROBLEM_NODE);
    const stray: TutorTurn = { ...answered, request: { ...answered.request, node: 'made-up-node' } };
    expect(homeworkNode(stray)).toBeUndefined();
  });

  it('still needs an answer or a photo, as before', async () => {
    await expect(sendMath({ session: await newSession(), targetText: PROBLEM, node: PROBLEM_NODE }, deps(fakeGrind()))).rejects.toBeInstanceOf(TutorUserError);
  });
});

describe('the homework picture screen', () => {
  const renderHomework = async (grind: ReturnType<typeof fakeGrind>, node?: string) => {
    const session = await newSession();
    render(createElement(Homework, { session, targetText: PROBLEM, turns: [], deps: deps(grind), onFinished: () => undefined, node }));
    return session;
  };

  it('names the node of the problem in the turn it sends', async () => {
    const grind = fakeGrind();
    const session = await renderHomework(grind);
    fireEvent.change(await screen.findByLabelText('Answer'), { target: { value: '33' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(grind.sends).toHaveLength(1));
    expect(grind.sends[0].input).toMatchObject({ mode: 'math', child_answer: '33', node: PROBLEM_NODE });
    const turns = await tutorRepo.listTurns(session.id);
    expect(onGraph(turns.find((t) => t.mode === 'math')?.request.node)).toBe(true);
  });

  it('with no licence shows the one line and makes no grind call', async () => {
    setLicenceStatus({ state: 'none', checkedAt: '2026-10-25T09:00:00.000Z' });
    const grind = fakeGrind();
    const session = await renderHomework(grind);
    expect(await screen.findByText(NO_LICENCE_LINE)).toBeInTheDocument();
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(grind.sendGrist).not.toHaveBeenCalled();
    expect(await tutorRepo.listTurns(session.id)).toHaveLength(0);
  });

  it('opens when a licence is held', async () => {
    setLicenceStatus({ state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: '2026-10-25T09:00:00.000Z' });
    await renderHomework(fakeGrind());
    expect(await screen.findByLabelText('Answer')).toBeInTheDocument();
    expect(screen.queryByText(NO_LICENCE_LINE)).not.toBeInTheDocument();
  });
});
