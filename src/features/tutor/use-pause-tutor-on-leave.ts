// src/features/tutor/use-pause-tutor-on-leave.ts — The tutor's speech pauses, not stops, when its screen goes away (mw-kuy7rx.20)

import { useEffect } from 'react';
import { pauseTutorSpeech } from '../../audio';

/** Pauses the tutor's speech when the screen using it goes away or the page goes hidden. */
export function usePauseTutorOnLeave(): void {
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') pauseTutorSpeech();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      pauseTutorSpeech();
    };
  }, []);
}
