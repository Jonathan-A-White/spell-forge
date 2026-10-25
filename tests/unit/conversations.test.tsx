// mw-79en7t.20: Conversations, the talks kept on the phone as a searchable list (voice-kit's TalkList over the app's talks store);
// a tap opens one talk to read, and Back returns to the list. The store is voice-kit's own in-memory TalkStore, filled the way the
// front door fills it: tests never touch the network.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore, type TalkStore } from 'voice-kit/talks';
import { Conversations } from '../../src/features/talks/Conversations';

let store: TalkStore;
let clock = 1_760_000_000_000;

async function addTalk(title: string, turns: [role: 'user' | 'assistant', text: string][]) {
  const talk = await store.create({ title, now: (clock += 60_000) });
  await store.append(
    talk.id,
    turns.map(([role, text]) => ({ role, text, at: (clock += 1000) })),
  );
  return talk.id;
}

beforeEach(async () => {
  store = createMemoryStore({ now: () => clock });
  await addTalk('Dragons', [
    ['user', 'Tell me about dragons'],
    ['assistant', 'Dragons are made up, but fire-breathing is a fun idea. What do you want to learn?'],
  ]);
  await addTalk('Times tables', [
    ['user', 'I want to practise my sevens'],
    ['assistant', 'Seven sevens is a good one to start from. Want to try a few?'],
  ]);
});

afterEach(cleanup);

describe('Conversations lists the talks (mw-79en7t.20 AC2)', () => {
  it('lists every talk, the one added to last first', async () => {
    render(<Conversations store={store} onBack={() => undefined} />);

    const list = await screen.findByRole('list', { name: 'Conversations' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('I want to practise my sevens');
    expect(rows[1]).toHaveTextContent('Tell me about dragons');
  });

  it('says so when there are no talks', async () => {
    render(<Conversations store={createMemoryStore()} onBack={() => undefined} />);

    expect(await screen.findByText(/No conversations yet/)).toBeInTheDocument();
  });
});

describe('Conversations is searched by a word (mw-79en7t.20 AC2)', () => {
  it('a word in a question or an answer narrows the list to the talks that hold it', async () => {
    render(<Conversations store={store} onBack={() => undefined} />);
    await screen.findByRole('list', { name: 'Conversations' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'sevens' } });

    await waitFor(() => {
      const rows = within(screen.getByRole('list', { name: 'Conversations' })).getAllByRole('listitem');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent(/sevens/);
    });
  });

  it('a word no talk holds says so', async () => {
    render(<Conversations store={store} onBack={() => undefined} />);
    await screen.findByRole('list', { name: 'Conversations' });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'zeppelin' } });

    expect(await screen.findByText(/No conversation has those words/)).toBeInTheDocument();
  });
});

describe('Conversations leaves out a talk nobody said anything in', () => {
  it('a talk with no turns is not listed', async () => {
    await store.create({ title: 'Front door' });
    render(<Conversations store={store} onBack={() => undefined} />);

    const list = await screen.findByRole('list', { name: 'Conversations' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('Conversations opens a talk (mw-79en7t.20 AC2)', () => {
  it('a tap shows its turns, his and the tutor\'s, and Back returns to the list', async () => {
    render(<Conversations store={store} onBack={() => undefined} />);
    const list = await screen.findByRole('list', { name: 'Conversations' });

    fireEvent.click(within(list).getByRole('button', { name: /Tell me about dragons/ }));

    const talk = await screen.findByRole('region', { name: 'Conversation' });
    expect(within(talk).getByText('Tell me about dragons')).toBeInTheDocument();
    expect(within(talk).getByText(/fire-breathing is a fun idea/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to conversations' }));

    expect(await screen.findByRole('list', { name: 'Conversations' })).toBeInTheDocument();
  });

  it('Back on the list leaves Conversations', async () => {
    const onBack = vi.fn();
    render(<Conversations store={store} onBack={onBack} />);
    await screen.findByRole('list', { name: 'Conversations' });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
