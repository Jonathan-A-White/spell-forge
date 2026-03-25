import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { TestResult } from '../../contracts/types';

export const testResultRepo = {
  async create(data: Omit<TestResult, 'id'>): Promise<TestResult> {
    const result: TestResult = { ...data, id: uuidv4() };
    await db.testResults.add(result);
    return result;
  },

  async getById(id: string): Promise<TestResult | null> {
    const result = await db.testResults.get(id);
    return result ?? null;
  },

  async getByWordListId(wordListId: string): Promise<TestResult | null> {
    const result = await db.testResults.where('wordListId').equals(wordListId).first();
    return result ?? null;
  },

  async getByProfileId(profileId: string): Promise<TestResult[]> {
    return db.testResults.where('profileId').equals(profileId).toArray();
  },

  async update(id: string, data: Partial<TestResult>): Promise<TestResult> {
    await db.testResults.update(id, data);
    const updated = await db.testResults.get(id);
    if (!updated) throw new Error(`TestResult ${id} not found`);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.testResults.delete(id);
  },

  async deleteByWordListId(wordListId: string): Promise<void> {
    await db.testResults.where('wordListId').equals(wordListId).delete();
  },

  async deleteByProfileId(profileId: string): Promise<void> {
    await db.testResults.where('profileId').equals(profileId).delete();
  },

  /**
   * Get words that were marked wrong across multiple tests for a profile.
   * Returns word texts with the count of tests they were missed on.
   */
  async getTroubleWords(profileId: string): Promise<{ word: string; wordId: string; missedCount: number; testDates: Date[] }[]> {
    const allResults = await this.getByProfileId(profileId);
    const missedMap = new Map<string, { word: string; wordId: string; count: number; dates: Date[] }>();

    for (const result of allResults) {
      for (const wr of result.wordResults) {
        if (!wr.correct) {
          const existing = missedMap.get(wr.wordId);
          if (existing) {
            existing.count++;
            existing.dates.push(result.testDate);
          } else {
            missedMap.set(wr.wordId, {
              word: wr.word,
              wordId: wr.wordId,
              count: 1,
              dates: [result.testDate],
            });
          }
        }
      }
    }

    return Array.from(missedMap.values())
      .map(({ word, wordId, count, dates }) => ({
        word,
        wordId,
        missedCount: count,
        testDates: dates,
      }))
      .sort((a, b) => b.missedCount - a.missedCount);
  },
};
