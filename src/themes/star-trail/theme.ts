import type { Theme } from '../../contracts/types.ts';

export const starTrailTheme: Theme = {
  id: 'star-trail',
  name: 'Star Trail',
  description: 'Collect stars as you spell your way across the galaxy! Light up constellations and explore the universe.',
  ageRange: '5-12',
  palette: {
    primary: '#001D66',
    secondary: '#FAAD14',
    accent: '#D9D9D9',
    background: '#000A1A',
    text: '#F0F0F0',
    success: '#52C41A',
    error: '#FF4D4F',
  },
  rewardMechanic: {
    type: 'collect',
    unitName: 'stars',
    milestoneNames: ['First Light', 'Cluster', 'Constellation', 'Galaxy', 'Universe'],
    progressPerCorrect: 1,
    progressPerSession: 3,
    weeklyGoalReward: 'Shooting Star',
  },
  assets: {
    icon: 'star-trail-icon',
    sounds: {
      correct: 'star-chime',
      milestone: 'constellation-fanfare',
      session: 'cosmic-whoosh',
    },
    images: {
      firstLight: 'star-first-light',
      cluster: 'star-cluster',
      constellation: 'star-constellation',
      galaxy: 'star-galaxy',
      universe: 'star-universe',
    },
  },
};
