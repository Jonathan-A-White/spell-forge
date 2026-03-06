import type { Theme } from '../../contracts/types.ts';

export const dragonForgeTheme: Theme = {
  id: 'dragon-forge',
  name: 'Dragon Forge',
  description: 'Build your dragon scale by scale! Earn scales for every word you conquer and watch your dragon grow from egg to full flight.',
  ageRange: '5-9',
  palette: {
    primary: '#D4380D',
    secondary: '#FA8C16',
    accent: '#FAAD14',
    background: '#FFF7E6',
    text: '#2D1600',
    success: '#52C41A',
    error: '#FF4D4F',
  },
  rewardMechanic: {
    type: 'build',
    unitName: 'scales',
    milestoneNames: ['Egg', 'Hatching', 'Baby Dragon', 'Young Dragon', 'Full Dragon'],
    progressPerCorrect: 1,
    progressPerSession: 3,
    weeklyGoalReward: 'Golden Scale',
  },
  assets: {
    icon: 'dragon-forge-icon',
    sounds: {
      correct: 'dragon-roar-small',
      milestone: 'dragon-roar-big',
      session: 'forge-hammer',
    },
    images: {
      egg: 'dragon-egg',
      hatching: 'dragon-hatching',
      baby: 'dragon-baby',
      young: 'dragon-young',
      full: 'dragon-full',
    },
  },
};
