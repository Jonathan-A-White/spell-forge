import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Word } from '../../contracts/types';

export const wordRepo = {
  async create(data: Omit<Word, 'id'>): Promise<Word> {
    const word: Word = { ...data, id: uuidv4() };
    await db.words.add(word);
    return word;
  },

  async getById(id: string): Promise<Word | null> {
    const word = await db.words.get(id);
    return word ?? null;
  },

  async getByListId(listId: string): Promise<Word[]> {
    return db.words.where('listId').equals(listId).toArray();
  },

  async getByProfileId(profileId: string): Promise<Word[]> {
    return db.words.where('profileId').equals(profileId).toArray();
  },

  async update(id: string, data: Partial<Word>): Promise<Word> {
    await db.words.update(id, data);
    const updated = await db.words.get(id);
    if (!updated) throw new Error(`Word ${id} not found`);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.words, db.wordStats], async () => {
      await db.wordStats.where('wordId').equals(id).delete();
      await db.words.delete(id);
    });
  },
};
