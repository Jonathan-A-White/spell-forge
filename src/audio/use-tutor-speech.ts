// src/audio/use-tutor-speech.ts — React hook for the tutor's speech state (idle, playing or paused, and the sentence reached)

import { useSyncExternalStore } from 'react';
import { getTutorSpeech, subscribeTutorSpeech } from './speech.ts';
import type { TutorSpeechState } from './speech.ts';

export function useTutorSpeech(): TutorSpeechState {
  return useSyncExternalStore(subscribeTutorSpeech, getTutorSpeech);
}
