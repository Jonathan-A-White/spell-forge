// src/features/tutor/tutor-voice.ts — The tutor speaks in the voice picked for the child's profile (Tutor settings,
// mw-kuy7rx.8); with none picked, the phone's default voice by Postern's rule (see sayAsTutor in src/audio/speech.ts).

import { sayAsTutor } from '../../audio';
import { profileRepo } from '../../data/repositories';

/** A speak function for this child's tutor: reads the picked voice from the profile each time it speaks. */
export function tutorSayFor(profileId: string): (text: string) => Promise<void> {
  return async (text) => {
    const profile = await profileRepo.getById(profileId).catch(() => null);
    await sayAsTutor(text, profile?.settings.tutorVoice);
  };
}
