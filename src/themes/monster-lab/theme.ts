import type { Theme } from '../../contracts/types.ts';

export const monsterLabTheme: Theme = {
  id: 'monster-lab',
  name: 'Monster Lab',
  description: 'Build your own creature block by block! Earn blocks for every word you spell and assemble an amazing monster.',
  ageRange: '5-9',
  palette: {
    primary: '#722ED1',
    secondary: '#13C2C2',
    accent: '#52C41A',
    background: '#F0F5FF',
    text: '#1A0033',
    success: '#52C41A',
    error: '#FF4D4F',
  },
  visualEffects: {
    gradient: 'linear-gradient(135deg, #722ED1 0%, #13C2C2 50%, #52C41A 100%)',
    glowColor: 'rgba(114, 46, 209, 0.4)',
    particleColors: ['#B37FEB', '#13C2C2', '#52C41A'],
    shadowColor: 'rgba(114, 46, 209, 0.25)',
    progressGradient: 'linear-gradient(90deg, #722ED1 0%, #13C2C2 60%, #52C41A 100%)',
  },
  rewardMechanic: {
    type: 'build',
    unitName: 'blocks',
    milestoneNames: ['Blueprint', 'Base', 'Body', 'Details', 'Complete Creature'],
    progressPerCorrect: 1,
    progressPerSession: 3,
    weeklyGoalReward: 'Rare Monster Part',
  },
  assets: {
    icon: 'monster-lab-icon',
    sounds: {
      correct: 'block-snap',
      milestone: 'monster-cheer',
      session: 'lab-bubble',
    },
    images: {
      blueprint: 'monster-blueprint',
      base: 'monster-base',
      body: 'monster-body',
      details: 'monster-details',
      complete: 'monster-complete',
    },
  },
};
