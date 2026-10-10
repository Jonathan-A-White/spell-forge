// src/features/tutor/speech-bar.tsx — The tutor's speaking bar (mw-kuy7rx.20, mw-m7v5kc.4): while the tutor speaks or is
// paused, big 'Pause'/'Resume', 'Restart' and 'Stop' buttons sit in the page's flow (never over the picture or the text).
// It is bsv-kit/speech's SpeakingBar, themed to SpellForge in speech-bar.css; the engine keeps the sentence reached.
// Leaving the screen or the page going hidden pauses the speech, so coming back offers Resume at the same place.

import { SpeakingBar } from 'bsv-kit/speech/react';
import 'bsv-kit/speech/styles.css';
import './speech-bar.css';

export function TutorSpeechBar() {
  return <SpeakingBar labels={{ region: 'Tutor speech' }} className="sf-speaking-bar" />;
}
