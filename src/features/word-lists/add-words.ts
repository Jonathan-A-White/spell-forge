// src/features/word-lists/add-words.ts — The one place new words are added to a list: a Word and its
// WordStats row each. Saving a list in the editor and a photo import both come through here.

import type { Word } from '../../contracts/types';
import { wordRepo, statsRepo } from '../../data/repositories';
import type { PlacedWord } from '../../learn/spelling';

export interface AddWordsParams {
  listId: string;
  profileId: string;
  words: string[];
  /** Where each word sits on the spelling graph (a photo import places them); a word without an entry has no node. */
  placed?: readonly PlacedWord[];
}

/** Trim, lowercase, drop blanks and repeats: what the editor's Save and a photo import both keep. */
export function normalizeWords(words: string[]): string[] {
  const seen = new Set<string>();
  for (const word of words) {
    const text = word.trim().toLowerCase();
    if (text.length > 0) seen.add(text);
  }
  return [...seen];
}

/** Adds each word the list does not hold yet; returns the Word rows it created. */
export async function addWordsToList({ listId, profileId, words, placed = [] }: AddWordsParams): Promise<Word[]> {
  const placement = new Map(placed.map((p) => [p.word, p]));
  const held = new Set((await wordRepo.getByListId(listId)).map((w) => w.text));
  const added: Word[] = [];

  for (const text of normalizeWords(words)) {
    if (held.has(text)) continue;
    const word = await wordRepo.create({
      listId,
      profileId,
      text,
      phonemes: [],
      syllables: [],
      patterns: [],
      imageUrl: null,
      imageCached: false,
      createdAt: new Date(),
      ...nodeFields(placement.get(text)),
    });
    await statsRepo.create({
      wordId: word.id,
      profileId,
      lastAsked: null,
      timesAsked: 0,
      timesWrong: 0,
      timesStruggledRight: 0,
      timesEasyRight: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      longestCorrectStreak: 0,
      currentBucket: 'new',
      nextReviewDate: new Date(),
      difficultyScore: 0.5,
      techniqueHistory: [],
    });
    added.push(word);
  }
  return added;
}

/** The node a word was placed on, and the reason when the factory's answer was not used; nothing for a word with no node. */
function nodeFields(placed: PlacedWord | undefined): Pick<Word, 'nodeId' | 'nodeReason'> {
  if (!placed) return {};
  return { ...(placed.nodeId ? { nodeId: placed.nodeId } : {}), ...(placed.reason ? { nodeReason: placed.reason } : {}) };
}
