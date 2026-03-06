import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { SessionLog } from '../../contracts/types';

export const sessionRepo = {
  async create(data: Omit<SessionLog, 'id'>): Promise<SessionLog> {
    const session: SessionLog = { ...data, id: uuidv4() };
    await db.sessionLogs.add(session);
    return session;
  },

  async getById(id: string): Promise<SessionLog | null> {
    const session = await db.sessionLogs.get(id);
    return session ?? null;
  },

  async getByProfileId(profileId: string): Promise<SessionLog[]> {
    return db.sessionLogs.where('profileId').equals(profileId).toArray();
  },

  async update(id: string, data: Partial<SessionLog>): Promise<SessionLog> {
    await db.sessionLogs.update(id, data);
    const updated = await db.sessionLogs.get(id);
    if (!updated) throw new Error(`SessionLog ${id} not found`);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.sessionLogs.delete(id);
  },
};
