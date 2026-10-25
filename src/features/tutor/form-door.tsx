// src/features/tutor/form-door.tsx — 'Let the tutor do it' on a grown-up form (mw-cb24ai.3, the Governor's word on Postern general
// 2026-10-23: "never make people fill out forms without an option for a tutor handle the interaction for them"). One button at the top
// of a form opens a panel where the tutor asks one question at a time, said or typed in voice-kit's Composer, and fills the fields he can
// see. The talk is Kestrel's: a voice-kit talk over the tutor-talk grind, built as the front door's is (front-door-flow.ts), with the
// form as the tutor sees it in the request (@voice-kit/forms). The tutor never sends: when every required field holds something the panel
// shows Send, and Send is his tap on the form's own confirm command (form-commands.ts), the handler the form's Save calls. With no
// licence no grind is called (src/shell/licence-gate.ts). A form that is given no `tutor` shows nothing of this.
import { useEffect, useId, useRef, useState } from 'react';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerMessage } from 'voice-kit/composer';
import 'voice-kit/composer/styles.css';
import { FORM_START, applyValues, argsOf, oneQuestion, requestFields, requiredFilled, type FormRequest, type FormSpec, type FormValue } from 'voice-kit/forms';
import { createMemoryStore, createTalks, defineRegistry, type Command, type OutgoingPicture, type RequestInput, type TalkStore, type TutorStore } from 'voice-kit/talks';
import { useAlive } from 'pwa-kit/alive';
import '../composer/composer-theme.css';
import { SPELLFORGE_COMPOSER_SETTINGS } from '../composer/composer-settings';
import { NO_LICENCE_LINE, gateGrind } from '../../shell/licence-gate';

export const START_LABEL = 'Let the tutor do it';
export const READY_LINE = 'Everything required is filled in. Read the form, change anything you like, then tap Send.';
const FAILED_LINE = 'The tutor could not answer just now.';

/** The request the form door sends to the tutor-talk grind (grinds/tutor-talk.request.schema.json): the talk and the form as the tutor sees it. */
export interface FormTalkRequest {
  schemaVersion: '1';
  message: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  memory?: { facts: string[]; summary: string };
  strictness: 'meaning-gated';
  form: FormRequest;
}

/** The answer the door reads (grinds/tutor-talk.answer.schema.json): what the tutor says, the values for fields, the field it asks about. */
export interface FormTalkAnswer {
  words: string;
  form_values?: FormValue[];
  form_ask?: string;
}

/** The grind: the request in, the answer out. A throw keeps nothing of the turn. */
export type FormTalkSend = (request: FormTalkRequest, files: OutgoingPicture[]) => Promise<FormTalkAnswer>;

/** What a form needs to offer the door: the grind, and where the talk is kept (in memory when absent: a form's talk is not kept). */
export interface FormTutor {
  send: FormTalkSend;
  store?: TalkStore & TutorStore;
}

export interface FormDoorProps {
  /** The form as the tutor sees it, as it is now (a field may become required as he chooses). */
  form: FormSpec;
  /** The form's confirm command: the very handler its Save calls (form-commands.ts). */
  command: Command;
  /** What each field holds now, by field name. */
  values: Readonly<Record<string, string>>;
  /** Puts the tutor's value in the field; the form does the setting and shows it. */
  onFill: (field: string, value: string) => void;
  tutor: FormTutor;
}

const LABELS: Partial<ComposerLabels> = {
  hold: 'Hold to talk to the tutor',
  typeInstead: 'Type a reply',
  placeholder: 'Your reply to the tutor',
  message: 'Your reply',
  send: 'Reply',
};
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97] disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-sf-primary text-sf-primary-text hover:bg-sf-primary-hover`;
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;
const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

type Phase = { name: 'idle' } | { name: 'sending' } | { name: 'failed' } | { name: 'asleep' };

export function FormDoor({ form, command, values, onFill, tutor }: FormDoorProps) {
  const [open, setOpen] = useState(false);
  const [say, setSay] = useState('');
  const [ask, setAsk] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [sent, setSent] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const alive = useAlive();
  const headingId = useId();
  const talkId = useRef<Promise<string> | null>(null);
  const lastMessage = useRef(FORM_START);
  const latest = useRef({ form, command, values, onFill, tutor });
  useEffect(() => {
    latest.current = { form, command, values, onFill, tutor };
  });

  // The kit's talk over the grind, made once: it reads the form as it is when each turn is taken. A form's talk is kept in memory.
  const [talks] = useState(() => {
    const store = tutor.store ?? createMemoryStore();
    return {
      store,
      ...createTalks<FormTalkRequest, FormTalkAnswer>({
        store,
        send: (request, files) => latest.current.tutor.send(request, files),
        answerText: (answer) => oneQuestion(answer.words),
        buildRequest: (input: RequestInput): FormTalkRequest => ({
          schemaVersion: '1',
          message: input.message,
          history: input.turns.map(({ role, text }) => ({ role, text })),
          ...(input.memory.facts.length > 0 || input.memory.summary ? { memory: { facts: [...input.memory.facts], summary: input.memory.summary } } : {}),
          strictness: 'meaning-gated',
          form: {
            name: latest.current.form.name,
            fields: requestFields(latest.current.form, latest.current.values),
            command: latest.current.command.name,
          },
        }),
      }),
    };
  });

  /** One turn of the talk. True when the tutor answered; false leaves what he said in the Composer's box. */
  async function turn(message: string): Promise<boolean> {
    lastMessage.current = message;
    if (!gateGrind().allowed) {
      setPhase({ name: 'asleep' });
      return false;
    }
    setPhase({ name: 'sending' });
    try {
      talkId.current ??= talks.start({ title: latest.current.form.name }).then((talk) => talk.id);
      const { answer } = await talks.ask(await talkId.current, message);
      if (!alive()) return true;
      const current = latest.current;
      const merged: Record<string, string> = { ...current.values };
      for (const { field, value } of applyValues(current.form, answer.form_values)) {
        current.onFill(field, value);
        merged[field] = value;
      }
      const next = current.form.fields.some((f) => f.name === answer.form_ask) ? answer.form_ask : undefined;
      setSay(oneQuestion(answer.words));
      setAsk(requiredFilled(current.form, merged) ? undefined : next);
      setPhase({ name: 'idle' });
      return true;
    } catch {
      if (alive()) setPhase({ name: 'failed' });
      return false;
    }
  }

  function start(): void {
    setOpen(true);
    setSay('');
    setAsk(undefined);
    void turn(FORM_START);
  }

  function stop(): void {
    setOpen(false);
    setPhase({ name: 'idle' });
  }

  // The Composer clears its box when this returns, and keeps what he said in it when it returns false.
  const reply = async ({ text }: ComposerMessage): Promise<boolean> => {
    if (!text || phase.name === 'sending') return false;
    return turn(text);
  };

  /** Send is his tap: the registry checks the args against the command's schema and runs the form's own handler, once. */
  async function send(): Promise<void> {
    if (sending) return;
    setSending(true);
    setRefused(null);
    const { form: current, command: cmd, values: held } = latest.current;
    const ran = await defineRegistry({ commands: [cmd] }).run(cmd.name, argsOf(current, held));
    if (!alive()) return;
    if (ran.ok) setSent(ran.said);
    else {
      setRefused(ran.why);
      setSending(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button type="button" onClick={start} className={`${SECONDARY} w-full`} style={TAP}>
          {START_LABEL}
        </button>
      </div>
    );
  }

  const thinking = phase.name === 'sending';
  const ready = requiredFilled(form, values) && !ask;
  return (
    <section role="region" aria-labelledby={headingId} className="mb-4 space-y-3 rounded-xl border border-sf-border bg-sf-surface p-4">
      <h2 id={headingId} className="text-sf-heading font-bold text-lg">The tutor</h2>
      {say && (
        <p data-testid="form-door-say" aria-live="polite" className="text-sf-heading text-lg font-medium">
          {say}
        </p>
      )}
      {thinking && (
        <p role="status" className="text-sf-muted">
          {say ? 'The tutor is thinking…' : 'The tutor is getting ready…'}
        </p>
      )}
      {phase.name === 'asleep' && (
        <p role="status" className="text-sf-muted">
          {NO_LICENCE_LINE}
        </p>
      )}
      {phase.name === 'failed' && (
        <div role="alert" className="space-y-2">
          <p className="text-sf-heading font-medium">{FAILED_LINE}</p>
          <button type="button" onClick={() => void turn(lastMessage.current)} className={SECONDARY} style={TAP}>
            Try again
          </button>
        </div>
      )}
      {ready && !thinking && !sent && (
        <p role="status" className="text-sf-heading font-medium">
          {READY_LINE}
        </p>
      )}
      {refused && (
        <p role="alert" className="text-sf-heading font-medium">
          {refused}
        </p>
      )}
      {sent && (
        <p role="status" className="text-sf-heading font-medium">
          {sent}
        </p>
      )}
      {ready && !thinking && !sent && (
        <button type="button" onClick={() => void send()} disabled={sending} className={PRIMARY} style={TAP}>
          Send
        </button>
      )}
      {!ready && !sent && phase.name !== 'asleep' && (
        <Composer className="sf-composer" settings={SPELLFORGE_COMPOSER_SETTINGS} labels={LABELS} appName="SpellForge" onSend={reply} />
      )}
      <button type="button" onClick={stop} className={SECONDARY} style={TAP}>
        Stop helping
      </button>
    </section>
  );
}
