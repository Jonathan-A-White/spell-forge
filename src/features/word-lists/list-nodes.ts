// src/features/word-lists/list-nodes.ts — The spelling-graph nodes a child's word lists practise (mw-79en7t.16): the nodes a photo import placed the
// words of the active lists on, newest list first and each node once. The Spelling world's drill takes them before the frontier.

import type { Word, WordList } from '../../contracts/types';
import { wordListRepo, wordRepo } from '../../data/repositories';

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The order is a rule with no equal keys (mw-6ww.175.37; a Dexie read and a bare createdAt both leave ties):
//   lists: newest createdAt first, then list id;
//   words of a list: the order they were added (createdAt, which addWordsToList gives each word its own millisecond), then word id.
// A node is listed where it first appears in that order.
const newestListFirst = (a: WordList, b: WordList): number => b.createdAt.getTime() - a.createdAt.getTime() || byId(a, b);
const addedOrder = (a: Word, b: Word): number => a.createdAt.getTime() - b.createdAt.getTime() || byId(a, b);

export async function listNodeIds(profileId: string): Promise<string[]> {
  const lists = (await wordListRepo.getActive(profileId)).sort(newestListFirst);
  const ids = new Set<string>();
  for (const list of lists) {
    const words = (await wordRepo.getByListId(list.id)).sort(addedOrder);
    for (const word of words) if (word.nodeId) ids.add(word.nodeId);
  }
  return [...ids];
}
