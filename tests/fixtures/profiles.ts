import type { Profile, AccessibilitySettings } from '../../src/contracts/types';

export const defaultSettings: AccessibilitySettings = {
  fontSize: 24,
  fontWeight: 'bold',
  fontFamily: 'system-ui, sans-serif',
  letterSpacing: 0.05,
  lineHeight: 1.6,
  contrastMode: 'light',
  backgroundColor: '#FFF8E7',
  reducedMotion: true,
  sessionMaxMinutes: 10,
  sessionAdaptive: true,
  dailyGoalMinutes: 5,
  tapTargetSize: 56,
};

export const paulProfile: Profile = {
  id: 'profile-paul',
  name: 'Paul',
  avatar: 'dragon-1',
  themeId: 'dragon-forge',
  pin: undefined,
  createdAt: new Date('2026-03-01'),
  settings: { ...defaultSettings },
};

export const emmaProfile: Profile = {
  id: 'profile-emma',
  name: 'Emma',
  avatar: 'star-1',
  themeId: 'star-trail',
  pin: undefined,
  createdAt: new Date('2026-03-02'),
  settings: {
    ...defaultSettings,
    fontSize: 20,
    fontWeight: 'normal',
    reducedMotion: false,
  },
};
