// src/features/front-door/FrontDoor.tsx — the front door's screen (Kestrel 13c). The tutor greets him by voice; he holds the
// big bar to talk (and has the camera) and there is no keyboard: what he says goes to the front door's flow, and every answer
// is drawn and spoken through TutorText (M16). With no licence the tutor is asleep: the worlds are offered as big pictures
// under the gate's one line, and nothing is sent. The flow is given (front-door-flow.ts). Something another app shared with
// SpellForge (Share > SpellForge, src/share) waits on this screen with a tap to send it, and lands in the talk as his turn
// (share-landing.ts); it is never sent by itself. When the tutor's answer offers to pass an ask on to the maker, the line carries
// "Send this to the maker" (src/features/requests), sent only on a tap. Behind it all is the door's scene (src/look/scene): a slow
// WebGL picture in a lazy chunk, or its still fallback with no WebGL or with reduced motion.
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
import { MakerOfferCard } from '../requests/MakerOfferCard';
import type { MakerOffer } from '../requests/file-from-talk';
import { TutorSpeechBar } from '../tutor/speech-bar';
import { usePauseTutorOnLeave } from '../tutor/use-pause-tutor-on-leave';
import { TALK_WORLDS, type FrontDoorFlow, type TalkWorld } from './front-door-flow';
import type { Requests } from 'pwa-kit/requests';
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
  /** Where an ask the tutor offers to pass on is filed, and who asks (the child's id, or the grown-up's); without it no offer is drawn. */
  maker?: { requests: Requests; who: string; askId?: string };
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
  /** The tutor's offer to pass an ask on, under this line. */
  offer?: MakerOffer;
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
      <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sf-text border border-sf-border ${who === 'child' ? 'bg-sf-input-bg' : 'bg-sf-surface'}`}>{children}</div>
    </div>
  );
}

export function FrontDoor({ flow, open, greeting = FRONT_DOOR_GREETING, shared, onSharedUsed, maker }: FrontDoorProps) {
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

  const add = (who: Line['who'], text: string, offer?: MakerOffer): number => {
    const id = nextId.current++;
    setLines((previous) => [...previous, { id, who, text, ...(offer ? { offer } : {}) }]);
    return id;
  };

  /** One turn of the talk: what he said and any pictures, and the tutor's answer drawn. A throw leaves his line for the caller to keep or drop. */
  const exchange = async (text: string, pictures: OutgoingPicture[]): Promise<number> => {
    const line = add('child', text || (pictures.length === 1 ? 'A photo' : `${pictures.length} photos`));
    try {
      talk.current ??= flow.start();
      const reply = await flow.ask(await talk.current, text, pictures.length > 0 ? { pictures } : undefined);
      if (reply.kind === 'offer-worlds') setOffered(true);
      else add('tutor', reply.words, reply.maker);
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
      {asleep || offered ? (
        <Worlds open={open} />
      ) : (
        <>
          <Bubble who="tutor">
            <TutorText text={greeting} />
          </Bubble>
          {lines.map((line) => (
            <div key={line.id} className="space-y-2">
              <Bubble who={line.who}>{line.who === 'tutor' ? <TutorText text={line.text} /> : <p>{line.text}</p>}</Bubble>
              {line.offer && maker && <MakerOfferCard offer={line.offer} requests={maker.requests} who={maker.who} askId={maker.askId} />}
            </div>
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
