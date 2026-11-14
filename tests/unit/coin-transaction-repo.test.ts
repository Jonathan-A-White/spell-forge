// mw-6ww.175.66: transactions made in one millisecond come back newest first in one fixed order (greater id first).
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { coinTransactionRepo } from '../../src/data/repositories/coin-transaction-repo';
import type { CoinTransaction } from '../../src/contracts/types';

const T = new Date('2025-10-07T10:00:00.000Z');
const txn = (id: string, createdAt: Date): CoinTransaction => ({
  id,
  profileId: 'p1',
  amount: 1,
  reason: 'word-mastered',
  description: id,
  createdAt,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('coinTransactionRepo.getByProfileId', () => {
  it('lists transactions of an equal createdAt in the same order on 20 runs', async () => {
    await db.coinTransactions.bulkPut(['b', 'd', 'a', 'c'].map((id) => txn(id, T)));
    for (let run = 0; run < 20; run++) {
      expect((await coinTransactionRepo.getByProfileId('p1')).map((t) => t.id)).toEqual(['d', 'c', 'b', 'a']);
    }
  });

  it('still lists a later transaction first', async () => {
    await db.coinTransactions.bulkPut([txn('z', T), txn('a', new Date(T.getTime() + 1))]);
    expect((await coinTransactionRepo.getByProfileId('p1')).map((t) => t.id)).toEqual(['a', 'z']);
  });
});
