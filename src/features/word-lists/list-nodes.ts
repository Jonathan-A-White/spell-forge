// src/features/word-lists/list-nodes.ts — The spelling-graph nodes a child's word lists practise (mw-79en7t.16): the nodes a photo import placed the
// words of the active lists on, newest list first and each node once. The Spelling world's drill takes them before the frontier.

import { wordListRepo, wordRepo } from '../../data/repositories';

export async function listNodeIds(profileId: string): Promise<string[]> {
  const lists = (await wordListRepo.getActive(profileId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ids = new Set<string>();
  for (const list of lists) {
    const words = (await wordRepo.getByListId(list.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.text.localeCompare(b.text));
    for (const word of words) if (word.nodeId) ids.add(word.nodeId);
  }
  return [...ids];
}
