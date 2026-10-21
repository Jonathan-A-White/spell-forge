// The dashboard views that load on mount drop what answers after they have closed (pwa-kit/alive).
// Each test holds the awaited read, unmounts, lets the read answer with the page torn down, and expects the
// promise to have touched nothing: no unhandled rejection, no uncaught error. No real clock is involved.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { settleAfterTeardown } from 'pwa-kit/test-preset';
import { PracticeCalendar } from '../../src/features/dashboard/practice-calendar';
import { CoinHistory } from '../../src/features/dashboard/coin-history';
import { WordDetailView } from '../../src/features/dashboard/word-detail-view';
import { DayDetailView } from '../../src/features/dashboard/day-detail-view';
import { sessionRepo } from '../../src/data/repositories/session-repo';
import { coinTransactionRepo } from '../../src/data/repositories/coin-transaction-repo';
import { db } from '../../src/data/db';

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('dashboard views answered after they have closed', () => {
  it('PracticeCalendar drops the sessions that arrive after it unmounted', async () => {
    const read = held<Awaited<ReturnType<typeof sessionRepo.getByProfileId>>>();
    vi.spyOn(sessionRepo, 'getByProfileId').mockReturnValue(read.promise);
    const { unmount } = render(<PracticeCalendar profileId="p1" streakData={null} onBack={vi.fn()} />);
    unmount();

    const raised = await settleAfterTeardown(() => read.resolve([]));
    expect(raised).toEqual([]);
  });

  it('CoinHistory drops the transactions that arrive after it unmounted', async () => {
    const read = held<Awaited<ReturnType<typeof coinTransactionRepo.getByProfileId>>>();
    vi.spyOn(coinTransactionRepo, 'getByProfileId').mockReturnValue(read.promise);
    const { unmount } = render(
      <CoinHistory
        profileId="p1"
        coinBalance={null}
        allStats={[]}
        activeWordCount={0}
        onBack={vi.fn()}
        onNavigate={vi.fn()}
        onAddWords={vi.fn()}
      />,
    );
    unmount();

    const raised = await settleAfterTeardown(() => read.resolve([]));
    expect(raised).toEqual([]);
  });

  it('WordDetailView drops the word that arrives after it unmounted', async () => {
    const read = held<undefined>();
    vi.spyOn(db.words, 'get').mockReturnValue(read.promise as never);
    // The other two reads answer at once, so the held word is the only one the view still waits on.
    vi.spyOn(db.wordStats, 'where').mockReturnValue({ first: () => Promise.resolve(undefined) } as never);
    vi.spyOn(db.learningProgress, 'where').mockReturnValue({ first: () => Promise.resolve(undefined) } as never);
    const { unmount } = render(<WordDetailView wordId="w1" profileId="p1" onBack={vi.fn()} />);
    unmount();

    const raised = await settleAfterTeardown(() => read.resolve(undefined));
    expect(raised).toEqual([]);
  });

  it('DayDetailView drops the attempts that arrive after it unmounted', async () => {
    const read = held<never[]>();
    vi.spyOn(db.wordStats, 'where').mockReturnValue({
      equals: () => ({ toArray: () => read.promise }),
    } as never);
    vi.spyOn(db.words, 'where').mockReturnValue({
      equals: () => ({ toArray: () => Promise.resolve([]) }),
    } as never);
    const { unmount } = render(<DayDetailView profileId="p1" dateKey="2026-10-21" sessions={[]} onBack={vi.fn()} />);
    unmount();

    const raised = await settleAfterTeardown(() => read.resolve([]));
    expect(raised).toEqual([]);
  });
});
