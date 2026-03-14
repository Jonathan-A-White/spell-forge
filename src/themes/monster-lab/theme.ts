import type { Theme } from '../../contracts/types.ts';

export const monsterLabTheme: Theme = {
  id: 'monster-lab',
  name: 'Monster Lab',
  description: 'Hatch your own monster from an egg! Earn energy for every word you spell and watch your egg crack open into an amazing creature.',
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
    type: 'hatch',
    unitName: 'energy',
    milestoneNames: ['Egg Found', 'Egg Warming', 'Egg Cracking', 'Hatching', 'Monster Born!'],
    progressPerCorrect: 2,
    progressPerSession: 5,
    weeklyGoalReward: 'Rare Monster Egg',
  },
  assets: {
    icon: 'monster-lab-icon',
    sounds: {
      correct: 'egg-pulse',
      milestone: 'egg-crack',
      session: 'lab-bubble',
    },
    images: {
      eggFound: 'monster-egg',
      eggWarming: 'monster-egg-warm',
      eggCracking: 'monster-egg-crack',
      hatching: 'monster-hatching',
      monsterBorn: 'monster-born',
    },
  },
};
