import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { WordList } from '../../contracts/types';

export const wordListRepo = {
  async create(data: Omit<WordList, 'id'>): Promise<WordList> {
    const list: WordList = { ...data, id: uuidv4() };
    await db.wordLists.add(list);
    return list;
  },

  async getById(id: string): Promise<WordList | null> {
    const list = await db.wordLists.get(id);
    return list ?? null;
  },

  async getByProfileId(profileId: string): Promise<WordList[]> {
    return db.wordLists.where('profileId').equals(profileId).toArray();
  },

  async getActive(profileId: string): Promise<WordList[]> {
    const lists = await db.wordLists.where('profileId').equals(profileId).toArray();
    return lists.filter(l => l.active && !l.archived);
  },

  async getArchived(profileId: string): Promise<WordList[]> {
    const lists = await db.wordLists.where('profileId').equals(profileId).toArray();
    return lists.filter(l => l.archived);
  },

  async update(id: string, data: Partial<WordList>): Promise<WordList> {
    await db.wordLists.update(id, data);
    const updated = await db.wordLists.get(id);
    if (!updated) throw new Error(`WordList ${id} not found`);
    return updated;
  },

  async archive(id: string): Promise<WordList> {
    return this.update(id, { archived: true, active: false });
  },

  async unarchive(id: string): Promise<WordList> {
    return this.update(id, { archived: false, active: true });
  },

  async delete(id: string): Promise<void> {
    const list = await db.wordLists.get(id);
    if (!list) return;
    await db.transaction('rw', [db.wordLists, db.words, db.wordStats], async () => {
      const wordIds = await db.words.where('listId').equals(id).primaryKeys();
      for (const wordId of wordIds) {
        await db.wordStats.where('wordId').equals(wordId).delete();
      }
      await db.words.where('listId').equals(id).delete();
      await db.wordLists.delete(id);
    });
  },
};
