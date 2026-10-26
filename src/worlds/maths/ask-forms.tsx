// src/worlds/maths/ask-forms.tsx — The four ways the maths world puts a problem to the child (Kestrel 19b), as components: type (a problem
// and a box), hear (the problem spoken through voice-kit, and a box), see (the problem drawn as a picture, and a box) and do (number tiles to
// drag or tap, or the answer said to the Composer, with no keyboard). Each only shows the problem and takes the answer as words: the world
// holds the answer so far, the Check, Hint and Not sure buttons, and the check itself (maths-flow.ts, on the phone). drill-forms.ts registers them.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Composer } from 'voice-kit/composer';
import type { ComposerLabels, ComposerSettings } from 'voice-kit/composer';
import 'voice-kit/composer/styles.css';
import '../../features/composer/composer-theme.css';
import { sayWord, stopSpeaking } from '../../audio/speech';
import type { MathsItem } from '../../learn/maths';

/** What a form is handed. */
export interface AskProps {
  item: MathsItem;
  /** The app language the problem is spoken in ('en', 'es'). */
  language: string;
  /** The answer so far, and a change of it. */
  value: string;
  onChange: (value: string) => void;
  /** An answer said aloud, already read as an answer (spokenAnswer): the world checks it at once. */
  onSpoken: (said: string) => void;
  /** An answer is in: the form takes no more. */
  disabled?: boolean;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 sf-control font-bold active:scale-[0.97] transition-transform bg-sf-surface border border-sf-border text-sf-text disabled:opacity-50';

function Problem({ item }: { item: MathsItem }) {
  return <p className="text-sf-heading sf-heading text-3xl">{item.problem}</p>;
}

function AnswerBox({ value, onChange, disabled }: Pick<AskProps, 'value' | 'onChange' | 'disabled'>) {
  return (
    <label className="flex flex-col gap-1 text-sf-text">
      <span className="text-sm">Your answer</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        enterKeyHint="done"
        style={TAP}
        className="px-3 sf-control border border-sf-border bg-sf-input-bg text-sf-heading text-xl"
      />
    </label>
  );
}

// ─── type ────────────────────────────────────────────────

export function TypeForm(props: AskProps): ReactElement {
  return (
    <>
      <Problem item={props.item} />
      <AnswerBox {...props} />
    </>
  );
}

// ─── hear ────────────────────────────────────────────────

/** The problem spoken through voice-kit (sayWord names the language), once as it comes and again on a tap; drawn too, for a phone that is quiet. */
export function HearForm(props: AskProps): ReactElement {
  const { item, language } = props;
  useEffect(() => {
    void sayWord(item.problem, language);
    return () => stopSpeaking();
  }, [item.problem, language]);
  return (
    <>
      <Problem item={item} />
      <button type="button" onClick={() => void sayWord(item.problem, language)} style={TAP} className={`${BUTTON} self-start`}>
        Hear it again
      </button>
      <AnswerBox {...props} />
    </>
  );
}

// ─── see ─────────────────────────────────────────────────

const PICTURE_WIDTH = 320;
const PICTURE_LINE_CHARS = 18;
const PICTURE_LINE_HEIGHT = 32;
const PICTURE_PAD = 18;

/** The problem's words cut into lines of at most `max` characters (a longer word has a line to itself). */
function pictureLines(problem: string, max: number = PICTURE_LINE_CHARS): string[] {
  const lines: string[] = [];
  for (const word of problem.trim().split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The problem drawn on a card (a word at a time, so that the whole problem is the picture's title and nowhere else in the page's text), as an SVG that takes the width it is given and the height that follows: the Shell's one scroll box does the scrolling. */
export function SeeForm(props: AskProps): ReactElement {
  const { item } = props;
  const lines = pictureLines(item.problem);
  const height = PICTURE_PAD * 2 + lines.length * PICTURE_LINE_HEIGHT;
  return (
    <>
      <svg viewBox={`0 0 ${PICTURE_WIDTH} ${height}`} role="img" aria-label={item.problem} focusable="false" className="w-full h-auto text-sf-heading">
        <title>{item.problem}</title>
        <rect x="2" y="2" width={PICTURE_WIDTH - 4} height={height - 4} rx="16" fill="currentColor" opacity="0.1" />
        {lines.map((line, i) => (
          <text
            key={i}
            x={PICTURE_WIDTH / 2}
            y={PICTURE_PAD + PICTURE_LINE_HEIGHT * (i + 0.72)}
            textAnchor="middle"
            fontSize="24"
            fontWeight="700"
            letterSpacing="0"
            fill="currentColor"
            aria-hidden="true"
          >
            {line.split(' ').map((word, w) => (
              <tspan key={w}>{w > 0 ? ` ${word}` : word}</tspan>
            ))}
          </text>
        ))}
      </svg>
      <AnswerBox {...props} />
    </>
  );
}

// ─── do ──────────────────────────────────────────────────

/** The tiles, the same for every problem so that they say nothing of the answer. */
const DO_TILES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '.', '/', ':'] as const;

/** Hold the bar, say the answer, let go: the Composer with no keyboard, no files and no camera. */
const DO_COMPOSER_SETTINGS: Partial<ComposerSettings> = { talk: 'hold', send: 'release', type: false, attach: false, camera: false };

const DO_LABELS: Partial<ComposerLabels> = {
  hold: 'Hold to say it',
  release: 'Let go to send',
  hint: 'Hold the button and say your answer. Let go to send.',
};

/** A click this soon after a tile was dropped in the answer is the same touch: it places nothing more. */
const DROP_CLICK_MS = 80;

export function DoForm({ item, value, onChange, onSpoken, disabled }: AskProps): ReactElement {
  const zone = useRef<HTMLDivElement>(null);
  const droppedAt = useRef(-Infinity);
  const [dragging, setDragging] = useState<{ tile: string; x: number; y: number } | null>(null);

  const add = (tile: string) => onChange(value + tile);

  const clicked = (tile: string, event: { timeStamp: number }) => {
    if (event.timeStamp - droppedAt.current < DROP_CLICK_MS) return;
    add(tile);
  };

  const lifted = (tile: string, event: { clientX: number; clientY: number; pointerId: number; currentTarget: Element }) => {
    setDragging({ tile, x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer that cannot be captured still drags where the phone sends its moves
    }
  };

  const dropped = (tile: string, event: { clientX: number; clientY: number; timeStamp: number }) => {
    setDragging(null);
    const over = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : null;
    if (over && zone.current?.contains(over)) {
      droppedAt.current = event.timeStamp;
      add(tile);
    }
  };

  return (
    <>
      <Problem item={item} />
      <div
        ref={zone}
        data-testid="answer-zone"
        role="group"
        aria-label="Your answer"
        style={TAP}
        className={`flex items-center px-3 sf-control border-2 border-dashed bg-sf-surface text-sf-heading text-xl ${dragging ? 'border-sf-primary' : 'border-sf-border'}`}
      >
        {value !== '' ? value : <span className="text-sf-muted text-base">Drag the numbers here</span>}
      </div>
      <div className="flex flex-wrap gap-2" style={{ touchAction: 'none', userSelect: 'none' }}>
        {DO_TILES.map((tile) => (
          <button
            key={tile}
            type="button"
            disabled={disabled}
            onClick={(e) => clicked(tile, e)}
            onPointerDown={(e) => lifted(tile, e)}
            onPointerMove={(e) => dragging?.tile === tile && setDragging({ tile, x: e.clientX, y: e.clientY })}
            onPointerUp={(e) => dropped(tile, e)}
            onPointerCancel={() => setDragging(null)}
            style={{ minHeight: 'var(--sf-tap-target-size)', minWidth: 'var(--sf-tap-target-size)', touchAction: 'none' }}
            className="sf-control bg-sf-surface border border-sf-border text-sf-heading text-xl font-bold active:scale-[0.97] disabled:opacity-50"
          >
            {tile}
          </button>
        ))}
      </div>
      {dragging && (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rounded-xl bg-sf-primary text-sf-primary-text px-4 py-2 text-xl font-bold"
          style={{ left: dragging.x, top: dragging.y, transform: 'translate(-50%, -130%)' }}
        >
          {dragging.tile}
        </span>
      )}
      <div className="flex gap-2">
        <button type="button" disabled={disabled || value === ''} onClick={() => onChange(value.slice(0, -1))} style={TAP} className={BUTTON}>
          Undo
        </button>
        <button type="button" disabled={disabled || value === ''} onClick={() => onChange('')} style={TAP} className={BUTTON}>
          Clear
        </button>
      </div>
      {!disabled && (
        <Composer
          className="sf-composer"
          settings={DO_COMPOSER_SETTINGS}
          labels={DO_LABELS}
          appName="SpellForge"
          onSend={(message) => onSpoken(message.text)}
        />
      )}
    </>
  );
}
