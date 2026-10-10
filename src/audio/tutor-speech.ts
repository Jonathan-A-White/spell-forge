// src/audio/tutor-speech.ts — The tutor's sentences, spoken by bsv-kit/speech (mw-m7v5kc.4).
//
// The package speaks a text sentence by sentence, keeps the sentence reached across Pause and Resume, goes back to the
// first on Restart, and lets a new speech replace the old (Pause cancels the queue and Resume queues from the kept
// sentence: Android Chrome does not honour speechSynthesis.pause()).  A hidden page pauses it; leaving the Tutor screen
// pauses it (usePauseTutorOnLeave).  The bar is the package's SpeakingBar (src/features/tutor/speech-bar.tsx).
//
// The one thing the package does not do is speak in a voice the child picked in Tutor settings: it chooses a voice for
// each sentence's language.  The picked voice is put on the tutor's utterances as they are queued (see applyPickedVoice).

import { isSpeaking, isSupported, getSpeech, pause, speak, subscribe, whenDone } from 'bsv-kit/speech';

/** Who the tutor's speech is, in the package: what a screen and the bar ask about. */
export const TUTOR_SPEECH_KEY = 'tutor';

let pickedVoiceURI: string | null = null;
const patched = new WeakSet<object>();

/**
 * Puts the voice picked in Tutor settings on each of the tutor's utterances as the package queues them (also when it
 * queues them again after a Resume or Restart).  Only while the tutor is the one playing: a word spoken by spelling
 * practice, or a tutor speech that is paused, keeps its own voice.  A picked voice the phone no longer lists is ignored,
 * and the package's choice for the language stands.
 */
function applyPickedVoice(synth: SpeechSynthesis): void {
  if (patched.has(synth)) return;
  patched.add(synth);
  const queue = synth.speak.bind(synth);
  synth.speak = (utterance) => {
    const speech = getSpeech();
    if (pickedVoiceURI && speech.key === TUTOR_SPEECH_KEY && speech.status === 'playing') {
      const voice = synth.getVoices().find((v) => v.voiceURI === pickedVoiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    queue(utterance);
  };
}

/**
 * Say a text in the tutor's voice: the picked one (by voiceURI), else the phone's voice for its language.  It replaces
 * any tutor speech playing or paused; the first is not spoken to its end.  Resolves when the speech is over for good
 * (played out, stopped or replaced), not when it is only paused.
 */
export function sayAsTutor(text: string, voiceURI?: string | null): Promise<void> {
  if (!isSupported()) return Promise.resolve();
  pickedVoiceURI = voiceURI ?? null;
  applyPickedVoice(window.speechSynthesis);
  return new Promise<void>((resolve) => {
    const unsubscribe = subscribe(() => {
      if (!isSpeaking(TUTOR_SPEECH_KEY)) done();
    });
    function done() {
      unsubscribe();
      resolve();
    }
    speak(text, { key: TUTOR_SPEECH_KEY });
    if (isSpeaking(TUTOR_SPEECH_KEY)) whenDone(TUTOR_SPEECH_KEY, done);
    else done();
  });
}

/** Pause the tutor's speech, keeping the sentence reached.  Nothing of the tutor's playing, nothing to do. */
export function pauseTutorSpeech(): void {
  const speech = getSpeech();
  if (speech.key === TUTOR_SPEECH_KEY && speech.status === 'playing') pause();
}
