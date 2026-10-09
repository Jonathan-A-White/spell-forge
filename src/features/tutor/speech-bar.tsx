// src/features/tutor/speech-bar.tsx — The tutor's speaking bar (mw-kuy7rx.20): while the tutor speaks or is paused, big
// 'Pause'/'Resume', 'Restart' and 'Stop' buttons sit in the page's flow (never over the picture or the text). The
// engine keeps the sentence reached (src/audio/speech.ts); leaving the screen or the page going hidden pauses it, so
// coming back offers Resume at the same place (usePauseTutorOnLeave, in use-pause-tutor-on-leave.ts).

import { pauseTutorSpeech, restartTutorSpeech, resumeTutorSpeech, stopSpeaking, useTutorSpeech } from '../../audio';

const SVG = { viewBox: '0 0 24 24', fill: 'currentColor', width: 24, height: 24, 'aria-hidden': true } as const;
const BUTTON =
  'flex-1 min-w-0 px-1 py-1 rounded-xl font-bold text-base flex flex-col items-center justify-center gap-0.5 bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong active:scale-[0.97] transition-all';
/** The icon sits over the label so three buttons fit a 360 px phone at the child's own large text size. */
const TAP = { minHeight: 'max(44px, var(--sf-tap-target-size))' } as const;

export function TutorSpeechBar() {
  const { status } = useTutorSpeech();
  if (status === 'idle') return null;
  const paused = status === 'paused';
  return (
    <div role="group" aria-label="Tutor speech" className="flex w-full max-w-xl mx-auto gap-2">
      <button type="button" onClick={paused ? resumeTutorSpeech : pauseTutorSpeech} className={BUTTON} style={TAP}>
        {paused ? (
          <svg {...SVG}>
            <path d="M7 4v16l13-8z" />
          </svg>
        ) : (
          <svg {...SVG}>
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        )}
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button type="button" onClick={restartTutorSpeech} className={BUTTON} style={TAP}>
        <svg {...SVG}>
          <path d="M6 4h2.5v16H6zM20 4v16L9.5 12z" />
        </svg>
        Restart
      </button>
      <button type="button" onClick={stopSpeaking} className={BUTTON} style={TAP}>
        <svg {...SVG}>
          <path d="M6 6h12v12H6z" />
        </svg>
        Stop
      </button>
    </div>
  );
}
