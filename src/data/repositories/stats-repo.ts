import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { WordStats } from '../../contracts/types';

export const statsRepo = {
  async create(data: Omit<WordStats, 'id'>): Promise<WordStats> {
    const stats: WordStats = { ...data, id: uuidv4() };
    await db.wordStats.add(stats);
    return stats;
  },

  async getById(id: string): Promise<WordStats | null> {
    const stats = await db.wordStats.get(id);
    return stats ?? null;
  },

  async getByWordId(wordId: string): Promise<WordStats | null> {
    const stats = await db.wordStats.where('wordId').equals(wordId).first();
    return stats ?? null;
  },

  async getByProfileId(profileId: string): Promise<WordStats[]> {
    return db.wordStats.where('profileId').equals(profileId).toArray();
  },

  async update(id: string, data: Partial<WordStats>): Promise<WordStats> {
    await db.wordStats.update(id, data);
    const updated = await db.wordStats.get(id);
    if (!updated) throw new Error(`WordStats ${id} not found`);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.wordStats.delete(id);
  },
};
