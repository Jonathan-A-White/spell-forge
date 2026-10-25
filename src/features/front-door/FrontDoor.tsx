// src/features/front-door/FrontDoor.tsx — the front door's screen (Kestrel 13c). The tutor greets him by voice; he holds the
// big bar to talk (and has the camera) and there is no keyboard: what he says goes to the front door's flow, and every answer
// is drawn and spoken through TutorText (M16). With no licence the tutor is asleep: the worlds are offered as big pictures
// under the gate's one line, and nothing is sent. The flow is given (front-door-flow.ts); the route that draws this is 13d's.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerMessage } from 'voice-kit/composer';
import 'voice-kit/composer/styles.css';
import '../composer/composer-theme.css';
import { FRONT_DOOR_COMPOSER_SETTINGS } from '../composer/composer-settings';
import { LicenceLine } from '../../shell/LicenceLine';
import { licenceState, subscribeLicence } from '../../shell/licence-gate';
import { WORLDS, WORLD_ENTRY, openWorld, type ViewId } from '../../shell/worlds';
import { TutorSpeechBar } from '../tutor/speech-bar';
import { usePauseTutorOnLeave } from '../tutor/use-pause-tutor-on-leave';
import { TALK_WORLDS, type FrontDoorFlow, type TalkWorld } from './front-door-flow';
import { TutorText } from './TutorText';

export interface FrontDoorProps {
  flow: FrontDoorFlow;
  /** Opens a screen (the app's setView). */
  open: (view: ViewId) => void;
  /** What the tutor says on opening; spoken and drawn. */
  greeting?: string;
}

export const FRONT_DOOR_GREETING = 'Hello! I am your tutor. Hold the big button and tell me what you would like to do.';

const LABELS: Partial<ComposerLabels> = {
  hold: 'Hold to talk',
  release: 'Let go to send',
  hint: 'Hold the button and talk. Let go to send.',
  camera: 'Take a photo',
};

const ASK_FAILED = 'The tutor could not answer just now. Hold the button and try again.';

interface Line {
  id: number;
  who: 'child' | 'tutor';
  text: string;
}

const refuseFile = (file: { type: string }) => (file.type.startsWith('image/') ? undefined : 'Only a photo can be sent.');

/** The picture drawn on a world's button. */
function WorldArt({ world }: { world: TalkWorld }) {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" focusable="false" className="mx-auto">
      {world === 'spelling' ? (
        <>
          <rect x="8" y="22" width="36" height="52" rx="8" fill="currentColor" opacity="0.25" />
          <rect x="52" y="22" width="36" height="52" rx="8" fill="currentColor" opacity="0.25" />
          <text x="26" y="58" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">A</text>
          <text x="70" y="58" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">b</text>
        </>
      ) : (
        <>
          <rect x="10" y="10" width="76" height="76" rx="14" fill="currentColor" opacity="0.25" />
          <path d="M48 24v48M24 48h48" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** Without a licence: the worlds, big, to tap. A world with no screen yet is shown and cannot be opened. */
function Worlds({ open }: { open: (view: ViewId) => void }) {
  return (
    <section aria-label="Worlds" className="space-y-4">
      <LicenceLine />
      <ul className="grid grid-cols-2 gap-4">
        {TALK_WORLDS.map((id) => {
          const title = WORLDS.find((w) => w.id === id)?.title ?? id;
          const ready = WORLD_ENTRY[id] !== undefined;
          return (
            <li key={id}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => openWorld(id, open)}
                className="w-full rounded-2xl border border-sf-border bg-sf-surface text-sf-primary p-4 text-center active:scale-[0.97] disabled:opacity-60"
                style={{ minHeight: '10rem' }}
              >
                <WorldArt world={id} />
                <span className="block mt-2 text-sf-heading text-xl font-bold">{title}</span>
                {!ready && <span className="block text-sf-muted text-sm">Coming soon</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Bubble({ who, children }: { who: Line['who']; children: ReactNode }) {
  return (
    <div className={who === 'child' ? 'flex justify-end' : 'flex justify-start'}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sf-text border border-sf-border ${who === 'child' ? 'bg-sf-input-bg' : 'bg-sf-surface'}`}>{children}</div>
    </div>
  );
}

export function FrontDoor({ flow, open, greeting = FRONT_DOOR_GREETING }: FrontDoorProps) {
  const asleep = useSyncExternalStore(subscribeLicence, licenceState) === 'unlicensed';
  const [lines, setLines] = useState<Line[]>([]);
  const [offered, setOffered] = useState(false);
  const talk = useRef<Promise<string> | null>(null);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  usePauseTutorOnLeave();

  // The talk starts once, when the tutor is awake.
  useEffect(() => {
    if (!asleep && !talk.current) talk.current = flow.start();
  }, [asleep, flow]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lines]);

  const add = (who: Line['who'], text: string) => setLines((previous) => [...previous, { id: nextId.current++, who, text }]);

  // The Composer clears itself when this returns, and keeps the picture and shows the message when it throws.
  const submit = async ({ text, files }: ComposerMessage) => {
    const pictures = files.filter((file) => file.type.startsWith('image/')).map((file) => ({ bytes: file.bytes, mime: file.type, name: file.name }));
    if (!text && pictures.length === 0) return false;
    add('child', text || (pictures.length === 1 ? 'A photo' : `${pictures.length} photos`));
    try {
      talk.current ??= flow.start();
      const reply = await flow.ask(await talk.current, text, pictures.length > 0 ? { pictures } : undefined);
      if (reply.kind === 'offer-worlds') setOffered(true);
      else add('tutor', reply.words);
    } catch {
      throw new Error(ASK_FAILED);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      {asleep || offered ? (
        <Worlds open={open} />
      ) : (
        <>
          <Bubble who="tutor">
            <TutorText text={greeting} />
          </Bubble>
          {lines.map((line) => (
            <Bubble key={line.id} who={line.who}>
              {line.who === 'tutor' ? <TutorText text={line.text} /> : <p>{line.text}</p>}
            </Bubble>
          ))}
          <TutorSpeechBar />
          <div ref={endRef} />
          <Composer
            className="sf-composer"
            settings={FRONT_DOOR_COMPOSER_SETTINGS}
            refuseFile={refuseFile}
            labels={LABELS}
            appName="SpellForge"
            onSend={submit}
          />
        </>
      )}
    </div>
  );
}
