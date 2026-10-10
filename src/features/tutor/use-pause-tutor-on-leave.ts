// src/features/tutor/use-pause-tutor-on-leave.ts — The tutor's speech pauses, not stops, when its screen goes away (mw-kuy7rx.20)

import { useEffect } from 'react';
import { pauseTutorSpeech } from '../../audio';

/** Pauses the tutor's speech when the screen using it goes away (the page going hidden is paused by bsv-kit/speech itself). */
export function usePauseTutorOnLeave(): void {
  useEffect(() => pauseTutorSpeech, []);
}
