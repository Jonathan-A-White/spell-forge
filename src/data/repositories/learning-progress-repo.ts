import { db } from '../db';
import type { WordLearningProgress } from '../../contracts/types';

function makeId(profileId: string, wordId: string): string {
  return `${profileId}:${wordId}`;
}

export const learningProgressRepo = {
  async save(progress: WordLearningProgress): Promise<WordLearningProgress> {
    await db.learningProgress.put(progress);
    return progress;
  },

  async get(
    profileId: string,
    wordId: string,
  ): Promise<WordLearningProgress | null> {
    const id = makeId(profileId, wordId);
    const record = await db.learningProgress.get(id);
    return record ?? null;
  },

  async getByProfileId(profileId: string): Promise<WordLearningProgress[]> {
    return db.learningProgress.where('profileId').equals(profileId).toArray();
  },

  async getByWordListId(
    profileId: string,
    wordListId: string,
  ): Promise<WordLearningProgress[]> {
    return db.learningProgress
      .where('[profileId+wordListId]')
      .equals([profileId, wordListId])
      .toArray();
  },

  async getMastered(profileId: string): Promise<WordLearningProgress[]> {
    return db.learningProgress
      .where('[profileId+mastered]')
      .equals([profileId, 1])
      .toArray();
  },

  async delete(profileId: string, wordId: string): Promise<void> {
    const id = makeId(profileId, wordId);
    await db.learningProgress.delete(id);
  },

  async deleteByProfileId(profileId: string): Promise<void> {
    await db.learningProgress.where('profileId').equals(profileId).delete();
  },

  async deleteByWordListId(
    profileId: string,
    wordListId: string,
  ): Promise<void> {
    const items = await this.getByWordListId(profileId, wordListId);
    const ids = items.map((item) => item.id);
    await db.learningProgress.bulkDelete(ids);
  },
};
