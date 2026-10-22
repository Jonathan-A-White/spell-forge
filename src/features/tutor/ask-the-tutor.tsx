// src/features/tutor/ask-the-tutor.tsx — 'Ask the tutor' on the Grown-ups screen (mw-kuy7rx.13): say or type a question
// in voice-kit's Composer (hold to talk, the words wait in the box, Send; mw-06ggew.9), wait with the seconds, read the
// answer with its examples. The last 10 asks stay on the device, each with its answer. What is shown is live from
// the parentAsks table, so a reload picks a waiting ask up where it was.

import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerMessage } from 'voice-kit/composer';
import 'voice-kit/composer/styles.css';
import '../composer/composer-theme.css';
import type { ParentAsk } from '../../contracts/types';
import { parentAskRepo, tutorRepo } from '../../data/repositories';
import { ParentAskInFlight } from '../../grist';
import { PARENT_ASK_MAX_PICTURES, PARENT_ASK_MAX_QUESTION } from './parent-ask-request';
import { PARENT_ASK_HISTORY, failHalfSentAsks, sendParentAsk } from './parent-ask-flow';
import type { ParentAskDeps } from './parent-ask-flow';
import { ASK_THE_TUTOR_COMPOSER_SETTINGS } from '../composer/composer-settings';
import { Waiting } from './pictures';
import { TutorUserError, deviceKey } from './tutor-flow';

export interface AskTheTutorProps {
  profileId: string;
  deps?: ParentAskDeps;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-4 rounded-xl font-bold border active:scale-[0.97] disabled:opacity-50';
const SECONDARY = `${BUTTON} bg-sf-surface border-sf-border text-sf-heading hover:border-sf-border-strong`;
const OUT: ReadonlySet<ParentAsk['status']> = new Set(['sending', 'waiting']);
const LABELS: Partial<ComposerLabels> = {
  hold: 'Hold to ask',
  typeInstead: 'Type a question',
  placeholder: 'For example: Which words does he get wrong most?',
  message: 'Your question',
};

/** Only pictures go with a question; anything else the picker or a paste brings is refused with this. */
const refuseFile = (file: { type: string }) =>
  file.type.startsWith('image/') ? undefined : 'Only pictures can be sent with a question.';

/** The pictures a question went with, as small thumbnails; the shared viewer (mw-t49ebj.5) will open them. */
function AskPictures({ ids }: { ids: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    void (async () => {
      for (const id of key.split(',')) {
        const blob = await tutorRepo.getBlob(id);
        if (cancelled) return;
        if (blob && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          made.push(URL.createObjectURL(new Blob([blob.bytes], { type: blob.mime })));
        }
      }
      if (!cancelled) setUrls(made);
    })();
    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL?.(url);
    };
  }, [key]);
  if (urls.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Pictures sent with the question">
      {urls.map((url, i) => (
        <li key={url}>
          <img src={url} alt={`Picture ${i + 1} of ${urls.length} sent with the question`} className="h-20 w-20 rounded-lg object-cover border border-sf-border" />
        </li>
      ))}
    </ul>
  );
}

export function AskTheTutor({ profileId, deps = {} }: AskTheTutorProps) {
  const [asks, setAsks] = useState<ParentAsk[] | null>(null);
  // Ask again puts an earlier question back in the box: a new key makes the Composer open with it (initialText).
  const [again, setAgain] = useState<{ text: string; n: number }>({ text: '', n: 0 });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  // The asks on screen, live from Dexie: answers land there from the grist client below.
  useEffect(() => {
    const subscription = liveQuery(() => parentAskRepo.listForProfile(profileId)).subscribe({
      next: setAsks,
      error: () => setAsks([]),
    });
    return () => subscription.unsubscribe();
  }, [profileId]);

  // Every ask still out is read for while this box is open; one a closed app left half-sent is failed.
  useEffect(() => {
    const d = depsRef.current;
    const inFlight = new ParentAskInFlight({ getKey: d.getKey ?? deviceKey, read: d.read, fetchImpl: d.fetchImpl, now: d.now });
    let cancelled = false;
    void (async () => {
      const mine = await parentAskRepo.listForProfile(profileId);
      if (!cancelled) await failHalfSentAsks(mine, (d.now ?? (() => new Date()))());
    })();
    const stop = inFlight.start(d.pollIntervalMs);
    return () => {
      cancelled = true;
      stop();
    };
  }, [profileId]);

  const shown = (asks ?? []).slice(0, PARENT_ASK_HISTORY);
  const out = (asks ?? []).some((ask) => OUT.has(ask.status));

  // The seconds count while the factory works on an ask.
  useEffect(() => {
    if (!out) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [out]);

  // The Composer clears its box when this returns, and keeps the words and shows the message when it throws.
  const submit = async ({ text, files }: ComposerMessage) => {
    if (!text || out) return false;
    const pictures = files.filter((file) => file.type.startsWith('image/')).map((file) => new Blob([new Uint8Array(file.bytes)], { type: file.type }));
    try {
      await sendParentAsk({ profileId, question: text, pictures }, depsRef.current);
    } catch (error) {
      throw error instanceof TutorUserError ? error : new Error('The question could not be sent. You can try again.');
    }
  };

  return (
    <section aria-labelledby="ask-the-tutor-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <h2 id="ask-the-tutor-title" className="text-sf-heading font-bold text-lg">Ask the tutor</h2>
      <p className="text-sf-muted text-sm">
        Ask about how your child is getting on. The tutor answers from the last 20 sessions. Hold the microphone and say it, or type it. You can add up to {PARENT_ASK_MAX_PICTURES} pictures with the camera or the paper clip.
      </p>
      <Composer
        key={again.n}
        className="sf-composer"
        settings={ASK_THE_TUTOR_COMPOSER_SETTINGS}
        refuseFile={refuseFile}
        labels={LABELS}
        appName="SpellForge"
        initialText={again.text}
        maxLength={PARENT_ASK_MAX_QUESTION}
        disabled={out}
        onSend={submit}
      />
      {asks && shown.length === 0 && <p className="text-sf-muted">No questions yet.</p>}
      {shown.length > 0 && (
        <ul className="space-y-3">
          {shown.map((ask) => (
            <li key={ask.id} className="rounded-xl border border-sf-border bg-sf-bg p-3 space-y-2">
              <p className="text-sf-heading font-bold">{ask.question}</p>
              {ask.pictures && ask.pictures.length > 0 && <AskPictures ids={ask.pictures} />}
              {OUT.has(ask.status) && <Waiting label="Waiting for the answer" seconds={Math.max(0, Math.floor((nowMs - ask.askedAt.getTime()) / 1000))} />}
              {ask.status === 'answered' && ask.answer && (
                <>
                  <p className="text-sf-text whitespace-pre-line">{ask.answer.answer}</p>
                  {ask.answer.examples.length > 0 && (
                    <ul className="list-disc pl-5 text-sf-muted text-sm space-y-1">
                      {ask.answer.examples.map((example, i) => (
                        <li key={`${i}-${example}`}>{example}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {(ask.status === 'failed' || ask.status === 'refused') && (
                <>
                  <p className="text-sf-error">{ask.failureReason ?? 'The tutor could not answer this.'}</p>
                  <button
                    type="button"
                    className={SECONDARY}
                    style={TAP}
                    aria-label={`Ask again: ${ask.question}`}
                    onClick={() => setAgain((previous) => ({ text: ask.question, n: previous.n + 1 }))}
                  >
                    Ask again
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
