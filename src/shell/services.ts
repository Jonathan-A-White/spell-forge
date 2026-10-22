// src/shell/services.ts: the things the whole app shares, made once: the event bus (with the reward tracker wired to
// it), the audio manager and the OCR manager.
import type { Profile } from '../contracts/types';
import { createEventBus } from '../contracts/events';
import { AudioManagerImpl } from '../audio';
import { createOcrManager } from '../ocr';
import { rewardTracker } from '../features/rewards';

export const eventBus = createEventBus();

// Wire reward tracker to the event bus so it auto-tracks rewards from events
let activeProfileForBus: Profile | null = null;

/** The profile the reward tracker credits: the open one, or null when none is open. */
export function setBusProfile(profile: Profile | null): void {
  activeProfileForBus = profile;
}

eventBus.on('session:ended', (event) => {
  if (!activeProfileForBus || event.type !== 'session:ended') return;
  const reward = rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
  eventBus.emit({ type: 'reward:earned', payload: reward });
});

eventBus.on('streak:updated', (event) => {
  if (!activeProfileForBus || event.type !== 'streak:updated') return;
  rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
});

eventBus.on('word:attempted', (event) => {
  if (!activeProfileForBus || event.type !== 'word:attempted') return;
  rewardTracker.processEvent(activeProfileForBus.id, activeProfileForBus.themeId, event);
});

export const audioManager = new AudioManagerImpl();

export const ocrManager = createOcrManager();
