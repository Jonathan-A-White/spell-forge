// mw-79en7t.16: the nodes the child's active lists practise, which the Spelling drill takes first.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { profileRepo, wordListRepo } from '../../src/data/repositories';
import { addWordsToList } from '../../src/features/word-lists/add-words';
import { listNodeIds } from '../../src/features/word-lists/list-nodes';
import { placeWords } from '../../src/learn/spelling';

let profileId: string;

async function listWith(name: string, createdAt: Date, words: string[], over: { active?: boolean } = {}): Promise<string> {
  const list = await wordListRepo.create({ profileId, name, language: 'en', testDate: null, createdAt, source: 'camera', active: over.active ?? true, archived: false });
  await addWordsToList({ listId: list.id, profileId, words, placed: placeWords(words.map((word) => ({ word }))) });
  return list.id;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  profileId = (await profileRepo.create({ name: 'Ada' } as never)).id;
});

describe('listNodeIds', () => {
  it('lists each node of the active lists once, the newest list first', async () => {
    await listWith('Old', new Date('2026-10-01'), ['shop', 'jumping']);
    await listWith('New', new Date('2026-10-20'), ['badge', 'edge', 'light']);
    expect(await listNodeIds(profileId)).toEqual(['short-vowel-dge', 'vowel-team-igh', 'digraph-sh', 'suffix-ing']);
  });

  it('leaves out words with no node, and lists that are not active', async () => {
    await listWith('Plain', new Date('2026-10-01'), ['zap']);
    await listWith('Done', new Date('2026-10-02'), ['shop'], { active: false });
    expect(await listNodeIds(profileId)).toEqual([]);
  });
});
