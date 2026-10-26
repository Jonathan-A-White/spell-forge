// src/features/front-door/FrontDoor.tsx — the front door's screen (Kestrel 13c). The tutor greets him by voice; he holds the
// big bar to talk (and has the camera) and there is no keyboard: what he says goes to the front door's flow, and every answer
// is drawn and spoken through TutorText (M16). With no licence the tutor is asleep: the worlds are offered as big pictures
// under the gate's one line, and nothing is sent. The flow is given (front-door-flow.ts). Something another app shared with
// SpellForge (Share > SpellForge, src/share) waits on this screen with a tap to send it, and lands in the talk as his turn
// (share-landing.ts); it is never sent by itself. Behind it all is the door's scene (src/look/scene): a slow WebGL picture in a lazy
// chunk, or its still fallback with no WebGL or with reduced motion.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerMessage } from 'voice-kit/composer';
import type { OutgoingPicture } from 'voice-kit/talks';
import 'voice-kit/composer/styles.css';
import '../composer/composer-theme.css';
import { FRONT_DOOR_COMPOSER_SETTINGS } from '../composer/composer-settings';
import { SceneOrFallback } from '../../look/scene';
import { LicenceLine } from '../../shell/LicenceLine';
import { licenceState, subscribeLicence } from '../../shell/licence-gate';
import { WORLDS, WORLD_ENTRY, openWorld, type ViewId } from '../../shell/worlds';
import type { SharedItem } from '../../share/share-target';
import { TutorSpeechBar } from '../tutor/speech-bar';
import { usePauseTutorOnLeave } from '../tutor/use-pause-tutor-on-leave';
import { TALK_WORLDS, type FrontDoorFlow, type TalkWorld } from './front-door-flow';
import { TutorText } from './TutorText';
import { sharedTurn } from './share-landing';
import { TutorTalkError } from './tutor-talk-send';

export interface FrontDoorProps {
  flow: FrontDoorFlow;
  /** Opens a screen (the app's setView). */
  open: (view: ViewId) => void;
  /** What the tutor says on opening; spoken and drawn. */
  greeting?: string;
  /** What another app shared with SpellForge, taken at boot: it waits here for a tap. */
  shared?: SharedItem | null;
  /** Called once the shared item has been sent or turned away (or the tutor is asleep and cannot take it). */
  onSharedUsed?: () => void;
}

export const FRONT_DOOR_GREETING = 'Hello! I am your tutor. Hold the big button and tell me what you would like to do.';

const LABELS: Partial<ComposerLabels> = {
  hold: 'Hold to talk',
  release: 'Let go to send',
  hint: 'Hold the button and talk. Let go to send.',
  camera: 'Take a photo',
};

const ASK_FAILED = 'The tutor could not answer just now. Hold the button and try again.';

/** What a turn that failed says: the words the send chose for the child (offline, too slow, no licence), else the plain one. */
const whyNot = (error: unknown): string => (error instanceof TutorTalkError ? error.message : ASK_FAILED);

interface Line {
  id: number;
  who: 'child' | 'tutor';
  text: string;
}

const refuseFile = (file: { type: string }) => (file.type.startsWith('image/') ? undefined : 'Only a photo can be sent.');

/** The picture drawn on a world's card: big, in the theme's colours (the card's colour, and the accent for the spark). */
function WorldArt({ world }: { world: TalkWorld }) {
  return (
    <svg viewBox="0 0 144 112" width="144" height="112" aria-hidden="true" focusable="false" className="mx-auto">
      <ellipse cx="72" cy="100" rx="52" ry="7" fill="currentColor" opacity="0.15" />
      {world === 'spelling' ? (
        <>
          <g transform="rotate(-8 42 60)">
            <rect x="14" y="22" width="56" height="70" rx="12" fill="currentColor" opacity="0.28" />
            <text x="42" y="73" textAnchor="middle" fontSize="48" fontWeight="800" fill="currentColor">A</text>
          </g>
          <g transform="rotate(7 102 60)">
            <rect x="74" y="18" width="56" height="70" rx="12" fill="currentColor" opacity="0.28" />
            <text x="102" y="69" textAnchor="middle" fontSize="48" fontWeight="800" fill="currentColor">b</text>
          </g>
          <path d="M72 6l3.5 8 8.5 1-6.5 5.5 2 8.5-7.5-4.5-7.5 4.5 2-8.5-6.5-5.5 8.5-1z" fill="var(--sf-color-accent)" />
        </>
      ) : (
        <>
          <g transform="rotate(-6 48 58)">
            <rect x="12" y="20" width="72" height="72" rx="16" fill="currentColor" opacity="0.28" />
            <path d="M48 36v40M28 56h40" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          </g>
          <g transform="rotate(8 104 52)">
            <rect x="84" y="12" width="48" height="48" rx="12" fill="currentColor" opacity="0.28" />
            <path d="M96 30h24M96 42h24" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          </g>
          <circle cx="116" cy="84" r="9" fill="var(--sf-color-accent)" />
        </>
      )}
    </svg>
  );
}

/** Without a licence: the worlds, big, to tap, over the door's scene. A world with no screen yet is shown and cannot be opened. */
function Worlds({ open }: { open: (view: ViewId) => void }) {
  return (
    <section aria-label="Worlds" className="space-y-4">
      <LicenceLine />
      <ul className="grid grid-cols-1 gap-4">
        {TALK_WORLDS.map((id) => {
          const title = WORLDS.find((w) => w.id === id)?.title ?? id;
          const ready = WORLD_ENTRY[id] !== undefined;
          return (
            <li key={id}>
              <button type="button" disabled={!ready} onClick={() => openWorld(id, open)} className="sf-world-card disabled:opacity-60">
                <WorldArt world={id} />
                <span className="block text-sf-heading sf-heading text-2xl">{title}</span>
                {!ready && <span className="block text-sf-muted text-sm">Coming soon</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What was shared, waiting: its first picture and its words, to send on a tap or to turn away. Nothing goes until he taps. */
function SharedCard({ item, sending, onSend, onDrop }: { item: SharedItem; sending: boolean; onSend: () => void; onDrop: () => void }) {
  const picture = item.pictures[0];
  const url = useMemo(
    () => (picture && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(picture) : undefined),
    [picture],
  );
  useEffect(
    () => () => {
      if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <section
      aria-label={picture ? 'Shared picture' : 'Shared words'}
      data-testid={picture ? 'shared-picture' : 'shared-words'}
      className="space-y-3 rounded-xl border border-sf-border bg-sf-surface p-3"
    >
      {url && <img src={url} alt="The picture shared with SpellForge" className="mx-auto max-h-64 rounded-lg" />}
      {item.text && <p className="text-sf-text whitespace-pre-line break-words">{item.text}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={onSend}
          className="flex-1 rounded-xl bg-sf-primary text-white font-bold px-4 py-3 disabled:opacity-60"
          style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
        >
          {picture ? 'Send this picture' : 'Send these words'}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={onDrop}
          className="flex-1 rounded-xl border border-sf-border bg-sf-input-bg text-sf-text font-bold px-4 py-3 disabled:opacity-60"
          style={{ minHeight: 'var(--sf-tap-target-size, 48px)' }}
        >
          Not this one
        </button>
      </div>
    </section>
  );
}

function Bubble({ who, children }: { who: Line['who']; children: ReactNode }) {
  return (
    <div className={who === 'child' ? 'flex justify-end' : 'flex justify-start'}>
      <div data-who={who} className={`sf-bubble max-w-[85%] text-sf-text border border-sf-border ${who === 'child' ? 'bg-sf-input-bg' : 'bg-sf-surface'}`}>{children}</div>
    </div>
  );
}

export function FrontDoor({ flow, open, greeting = FRONT_DOOR_GREETING, shared, onSharedUsed }: FrontDoorProps) {
  const asleep = useSyncExternalStore(subscribeLicence, licenceState) === 'unlicensed';
  const [lines, setLines] = useState<Line[]>([]);
  const [offered, setOffered] = useState(false);
  const [sendingShared, setSendingShared] = useState(false);
  const talk = useRef<Promise<string> | null>(null);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  usePauseTutorOnLeave();

  // The talk starts once, when the tutor is awake.
  useEffect(() => {
    if (!asleep && !talk.current) talk.current = flow.start();
  }, [asleep, flow]);

  // With the tutor asleep nothing is sent, and a share is not kept waiting for a tutor who cannot take it.
  useEffect(() => {
    if (asleep && shared) onSharedUsed?.();
  }, [asleep, shared, onSharedUsed]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [lines]);

  const add = (who: Line['who'], text: string): number => {
    const id = nextId.current++;
    setLines((previous) => [...previous, { id, who, text }]);
    return id;
  };

  /** One turn of the talk: what he said and any pictures, and the tutor's answer drawn. A throw leaves his line for the caller to keep or drop. */
  const exchange = async (text: string, pictures: OutgoingPicture[]): Promise<number> => {
    const line = add('child', text || (pictures.length === 1 ? 'A photo' : `${pictures.length} photos`));
    try {
      talk.current ??= flow.start();
      const reply = await flow.ask(await talk.current, text, pictures.length > 0 ? { pictures } : undefined);
      if (reply.kind === 'offer-worlds') setOffered(true);
      else add('tutor', reply.words);
    } catch (error) {
      throw Object.assign(new Error(whyNot(error)), { line, words: whyNot(error) });
    }
    return line;
  };

  // The Composer clears itself when this returns, and keeps the picture and shows the message when it throws.
  const submit = async ({ text, files }: ComposerMessage) => {
    const pictures = files.filter((file) => file.type.startsWith('image/')).map((file) => ({ bytes: file.bytes, mime: file.type, name: file.name }));
    if (!text && pictures.length === 0) return false;
    await exchange(text, pictures);
  };

  // The share waits for this tap. If the tutor cannot answer, his line is taken back and the share stays to be tapped again.
  const sendShared = async () => {
    if (!shared || sendingShared) return;
    setSendingShared(true);
    try {
      const { message, pictures } = await sharedTurn(shared);
      await exchange(message, pictures);
      onSharedUsed?.();
    } catch (error) {
      const { line, words } = error as { line?: number; words?: string };
      if (line !== undefined) setLines((previous) => previous.filter((entry) => entry.id !== line));
      add('tutor', words ?? ASK_FAILED);
    } finally {
      setSendingShared(false);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <SceneOrFallback />
      <h1 className="sr-only">SpellForge</h1>
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
          {shared && <SharedCard item={shared} sending={sendingShared} onSend={() => void sendShared()} onDrop={() => onSharedUsed?.()} />}
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
