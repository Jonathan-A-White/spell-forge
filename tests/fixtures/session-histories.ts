import type { SessionLog, StreakData, TechniqueResult } from '../../src/contracts/types';

export const completedSession: SessionLog = {
  id: 'session-1',
  profileId: 'profile-paul',
  startedAt: new Date('2026-03-05T15:00:00'),
  endedAt: new Date('2026-03-05T15:07:00'),
  wordsAttempted: 6,
  wordsCorrect: 5,
  engagementScore: 0.85,
  endReason: 'completed',
  rewardEarned: {
    themeId: 'dragon-forge',
    unitsEarned: 8,
    milestoneReached: null,
    totalProgress: 24,
  },
};

export const adaptiveStopSession: SessionLog = {
  id: 'session-2',
  profileId: 'profile-paul',
  startedAt: new Date('2026-03-04T16:00:00'),
  endedAt: new Date('2026-03-04T16:04:00'),
  wordsAttempted: 3,
  wordsCorrect: 1,
  engagementScore: 0.35,
  endReason: 'adaptive-stop',
  rewardEarned: {
    themeId: 'dragon-forge',
    unitsEarned: 4,
    milestoneReached: null,
    totalProgress: 16,
  },
};

export const paulStreak: StreakData = {
  profileId: 'profile-paul',
  currentStreak: 3,
  longestStreak: 7,
  lastSessionDate: new Date('2026-03-05'),
  weeklyProgress: [
    { date: '2026-03-03', completed: true, sessionCount: 1 },
    { date: '2026-03-04', completed: true, sessionCount: 1 },
    { date: '2026-03-05', completed: true, sessionCount: 2 },
    { date: '2026-03-06', completed: false, sessionCount: 0 },
    { date: '2026-03-07', completed: false, sessionCount: 0 },
  ],
};

export const sampleTechniqueResults: TechniqueResult[] = [
  {
    techniqueId: 'letter-bank',
    timestamp: new Date('2026-03-05T15:01:00'),
    correct: true,
    responseTimeMs: 8500,
    struggled: false,
    scaffoldingUsed: false,
  },
  {
    techniqueId: 'letter-bank',
    timestamp: new Date('2026-03-05T15:02:00'),
    correct: false,
    responseTimeMs: 15000,
    struggled: true,
    scaffoldingUsed: true,
  },
  {
    techniqueId: 'letter-bank',
    timestamp: new Date('2026-03-05T15:03:00'),
    correct: true,
    responseTimeMs: 12000,
    struggled: true,
    scaffoldingUsed: true,
  },
];
