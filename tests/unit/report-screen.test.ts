// mw-79en7t.40 (Kestrel 13c, M37): every world tells the tutor where the child is (useReportScreen), the name and facts go in
// the next tutor request, and one Ask button opens the tutor with them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { createFrontDoorFlow, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import type { TutorTalkRequest } from '../../src/features/front-door/tutor-talk-request';
import {
  askTheTutor,
  currentScreen,
  reportScreen,
  screenContext,
  useReportScreen,
} from '../../src/shell/report-screen';
import { AskTutorButton } from '../../src/shell/AskTutorButton';
import type { ViewId } from '../../src/shell/worlds';

afterEach(() => {
  cleanup();
  act(() => reportScreen(null));
  screenContext();
});

describe('reportScreen', () => {
  it('holds the name and facts a world gave, and forgets them when told null', () => {
    expect(currentScreen()).toBeUndefined();
    reportScreen({ name: 'Spelling', facts: ['Working on the sound "ph"'] });
    expect(currentScreen()).toEqual({ name: 'Spelling', facts: ['Working on the sound "ph"'] });
    reportScreen(null);
    expect(currentScreen()).toBeUndefined();
  });

  it('keeps to what the tutor-talk request takes: at most 10 facts of 200 characters, and a name', () => {
    reportScreen({ name: 'Maths', facts: Array.from({ length: 12 }, (_, i) => `${i}`.padEnd(300, 'x')) });
    const screen = currentScreen()!;
    expect(screen.facts).toHaveLength(10);
    expect(screen.facts.every((fact) => fact.length <= 200)).toBe(true);
    reportScreen({ name: '  ', facts: ['x'] });
    expect(currentScreen()).toBeUndefined();
  });
});

describe('useReportScreen', () => {
  it('reports on mount, follows the facts, and forgets on unmount', () => {
    const { rerender, unmount } = renderHook(({ facts }) => useReportScreen('Spelling', facts), { initialProps: { facts: ['a'] } });
    expect(currentScreen()).toEqual({ name: 'Spelling', facts: ['a'] });
    rerender({ facts: ['a', 'b'] });
    expect(currentScreen()).toEqual({ name: 'Spelling', facts: ['a', 'b'] });
    unmount();
    expect(currentScreen()).toBeUndefined();
  });

  it('does not report again for the same facts in a new array', () => {
    const seen: unknown[] = [];
    const { rerender } = renderHook(({ facts }) => useReportScreen('Spelling', facts), { initialProps: { facts: ['a'] } });
    seen.push(currentScreen());
    rerender({ facts: ['a'] });
    seen.push(currentScreen());
    expect(seen[0]).toBe(seen[1]);
  });
});

describe('the next tutor request carries the screen', () => {
  let store: DexieTalkStore;
  let profileId: string;
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    store = createDexieStore({ name: `report-screen-test-${Math.random()}`, indexedDB, IDBKeyRange });
    profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  });
  afterEach(() => store.close());

  const flowWith = (send: TutorTalkSend) =>
    createFrontDoorFlow({ send, store, profileId, open: () => undefined, context: () => ({ goals: [], ...screenContext() }) });
  const requestOf = (send: ReturnType<typeof vi.fn<TutorTalkSend>>, call = 0): TutorTalkRequest => send.mock.calls[call][0];

  it('puts the world\'s name and facts in the request, and leaves the screen out when no world has reported', async () => {
    const send = vi.fn<TutorTalkSend>(async () => ({ words: 'Ok' }));
    const flow = flowWith(send);
    const talk = await flow.start();
    await flow.ask(talk, 'what is this');
    expect(requestOf(send, 0).screen).toBeUndefined();

    reportScreen({ name: 'Spelling', facts: ['Word 3 of 10', 'Sound: ph'] });
    await flow.ask(talk, 'help');
    expect(requestOf(send, 1).screen).toEqual({ name: 'Spelling', facts: ['Word 3 of 10', 'Sound: ph'] });
  });

  it('Ask opens the tutor with the screen it left, once: the next request carries it and the one after does not', async () => {
    const opened: ViewId[] = [];
    reportScreen({ name: 'Spelling', facts: ['Word 3 of 10'] });
    expect(askTheTutor((view) => opened.push(view))).toBe(true);
    expect(opened).toEqual(['tutor']);
    act(() => reportScreen(null)); // the world is gone: the tutor has opened

    const send = vi.fn<TutorTalkSend>(async () => ({ words: 'Ok' }));
    const flow = flowWith(send);
    const talk = await flow.start();
    await flow.ask(talk, 'help');
    await flow.ask(talk, 'again');
    expect(requestOf(send, 0).screen).toEqual({ name: 'Spelling', facts: ['Word 3 of 10'] });
    expect(requestOf(send, 1).screen).toBeUndefined();
  });

  it('Ask with no screen reported opens the tutor and carries nothing', () => {
    const opened: ViewId[] = [];
    expect(askTheTutor((view) => opened.push(view))).toBe(true);
    expect(opened).toEqual(['tutor']);
    expect(screenContext()).toEqual({});
  });
});

describe('the Ask button', () => {
  it('shows once a world has reported itself, opens the tutor with it, and is not on the tutor', () => {
    const opened: ViewId[] = [];
    const view = (id: ViewId) => createElement(AskTutorButton, { view: id, open: (v: ViewId) => opened.push(v) });
    const { rerender } = render(view('progress'));
    expect(screen.queryByRole('button', { name: 'Ask the tutor' })).toBeNull();

    act(() => reportScreen({ name: 'Spelling', facts: ['Word 3 of 10'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask the tutor' }));
    expect(opened).toEqual(['tutor']);
    expect(screenContext()).toEqual({ screen: { name: 'Spelling', facts: ['Word 3 of 10'] } });

    rerender(view('tutor'));
    expect(screen.queryByRole('button', { name: 'Ask the tutor' })).toBeNull();
  });
});
