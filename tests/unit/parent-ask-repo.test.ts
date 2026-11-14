// mw-6ww.175.62: asks made in one millisecond come back newest first in one fixed order (greater id first).
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { parentAskRepo } from '../../src/data/repositories';
import type { ParentAskRequest } from '../../src/contracts';

const request: ParentAskRequest = { question: 'How is he doing?', sessions: [] };
const T = new Date('2025-10-07T10:00:00.000Z');

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('parentAskRepo.listForProfile', () => {
  it('lists asks of an equal askedAt in the same order on 20 runs', async () => {
    const made = [];
    for (const q of ['one', 'two', 'three', 'four']) {
      made.push(await parentAskRepo.add({ profileId: 'p1', question: q, request, askedAt: T }));
    }
    const expected = made.map((a) => a.id).sort().reverse();
    for (let run = 0; run < 20; run++) {
      expect((await parentAskRepo.listForProfile('p1')).map((a) => a.id)).toEqual(expected);
    }
  });

  it('still lists a later ask first', async () => {
    const early = await parentAskRepo.add({ profileId: 'p1', question: 'a', request, askedAt: T });
    const late = await parentAskRepo.add({ profileId: 'p1', question: 'b', request, askedAt: new Date(T.getTime() + 1) });
    expect((await parentAskRepo.listForProfile('p1')).map((a) => a.id)).toEqual([late.id, early.id]);
  });
});
