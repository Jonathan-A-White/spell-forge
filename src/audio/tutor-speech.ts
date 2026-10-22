// src/audio/tutor-speech.ts — The tutor's sentences, spoken by voice-kit/speech (mw-m7v5kc.4).
//
// The package speaks a text sentence by sentence, keeps the sentence reached across Pause and Resume, goes back to the
// first on Restart, and lets a new speech replace the old (Pause cancels the queue and Resume queues from the kept
// sentence: Android Chrome does not honour speechSynthesis.pause()).  A hidden page pauses it; leaving the Tutor screen
// pauses it (usePauseTutorOnLeave).  The bar is the package's SpeakingBar (src/features/tutor/speech-bar.tsx).
//
// The voice is the one picked in Tutor settings (see voice.ts), handed to the package as speak's `voice`; the same
// setting drives the spelling words (speech.ts).

import { isSpeaking, isSupported, getSpeech, pause, speak, subscribe, whenDone } from 'voice-kit/speech';
import { findVoice, speechVoiceURI, voicesListed } from './voice.ts';

/** Who the tutor's speech is, in the package: what a screen and the bar ask about. */
export const TUTOR_SPEECH_KEY = 'tutor';

/**
 * Say a text in the tutor's voice: `voiceURI` (a sample of a voice in Tutor settings; null for the phone's default), else
 * the voice set with setSpeechVoice, else the phone's voice for its language.  A voice the phone no longer lists is
 * ignored, and the package's choice for the language stands.  It replaces any tutor speech playing or paused; the first
 * is not spoken to its end.  Resolves when the speech is over for good (played out, stopped or replaced), not when it is
 * only paused.
 */
export function sayAsTutor(text: string, voiceURI?: string | null): Promise<void> {
  if (!isSupported()) return Promise.resolve();
  const uri = voiceURI === undefined ? speechVoiceURI() : voiceURI;
  // A voice is found only among the voices the phone has listed; a pick made before that waits for them (up to a second).
  if (uri && window.speechSynthesis.getVoices().length === 0) return voicesListed().then(() => speakAsTutor(text, uri));
  return speakAsTutor(text, uri);
}

function speakAsTutor(text: string, voiceURI: string | null): Promise<void> {
  const voice = findVoice(voiceURI);
  return new Promise<void>((resolve) => {
    const unsubscribe = subscribe(() => {
      if (!isSpeaking(TUTOR_SPEECH_KEY)) done();
    });
    function done() {
      unsubscribe();
      resolve();
    }
    speak(text, { key: TUTOR_SPEECH_KEY, voice, lang: voice?.lang });
    if (isSpeaking(TUTOR_SPEECH_KEY)) whenDone(TUTOR_SPEECH_KEY, done);
    else done();
  });
}

/** Pause the tutor's speech, keeping the sentence reached.  Nothing of the tutor's playing, nothing to do. */
export function pauseTutorSpeech(): void {
  const speech = getSpeech();
  if (speech.key === TUTOR_SPEECH_KEY && speech.status === 'playing') pause();
}
