// src/features/learning/memory-aid-display.tsx — Memory aid cards for Stage 0

import type {
  MemoryAid,
  PhoneticAid,
  PatternAid,
  MnemonicAid,
} from '../../contracts/types';

interface MemoryAidDisplayProps {
  aid: MemoryAid;
  /** Speak a syllable chunk aloud (enables tap-to-hear on phonetic chunks) */
  onSpeakChunk?: (text: string) => void;
  audioBusy?: boolean;
}

/** Pattern highlight colors — maps colorIndex (1-4) to Tailwind classes.
 *  Uses theme-aware colors so highlights remain readable in dark mode. */
const PATTERN_COLORS = [
  '', // 0 = no pattern (plain)
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-700',
  'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-200 dark:border-amber-700',
  'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700',
  'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700',
];

export function MemoryAidDisplay({ aid, onSpeakChunk, audioBusy }: MemoryAidDisplayProps) {
  return (
    <div className="w-full max-w-md mx-auto bg-sf-surface border border-sf-border rounded-xl p-4 space-y-3">
      {aid.type === 'phonetic' && (
        <PhoneticContent aid={aid} onSpeakChunk={onSpeakChunk} audioBusy={audioBusy} />
      )}
      {aid.type === 'pattern' && <PatternContent aid={aid} />}
      {aid.type === 'mnemonic' && <MnemonicContent aid={aid} />}
    </div>
  );
}

// ─── Phonetic Aid ────────────────────────────────────────────

function PhoneticContent({
  aid,
  onSpeakChunk,
  audioBusy,
}: {
  aid: PhoneticAid;
  onSpeakChunk?: (text: string) => void;
  audioBusy?: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Syllable chunks — tap one to hear it */}
      <div className="flex flex-wrap items-start justify-center gap-3">
        {aid.chunks.map((chunk, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <button
              onClick={() => onSpeakChunk?.(chunk.text)}
              disabled={!onSpeakChunk || audioBusy}
              className={`text-xl font-bold text-blue-800 dark:text-blue-100 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 transition-colors ${
                onSpeakChunk && !audioBusy
                  ? 'hover:bg-blue-100 dark:hover:bg-blue-800/50 active:scale-95'
                  : ''
              } ${audioBusy ? 'opacity-50' : ''}`}
              aria-label={`Hear "${chunk.text}"`}
            >
              {chunk.text}
              {onSpeakChunk && (
                <span className="text-sm ml-1.5" aria-hidden="true">&#128266;</span>
              )}
            </button>
            <span className="text-sm text-sf-secondary">
              says &ldquo;{chunk.pronunciation}&rdquo;
            </span>
          </div>
        ))}
      </div>
      {onSpeakChunk && (
        <p className="text-center text-xs text-sf-muted">Tap a part to hear it</p>
      )}
      {/* Summary */}
      <p className="text-center text-base text-sf-secondary italic">{aid.summary}</p>
    </div>
  );
}

// ─── Pattern Aid ─────────────────────────────────────────────

function PatternContent({ aid }: { aid: PatternAid }) {
  return (
    <div className="space-y-3">
      {/* Highlighted word */}
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        {aid.segments.map((seg, i) => (
          <span
            key={i}
            className={`text-xl font-bold rounded px-1 py-0.5 ${
              seg.colorIndex > 0
                ? `${PATTERN_COLORS[seg.colorIndex]} border`
                : 'text-sf-heading'
            }`}
          >
            {seg.text}
          </span>
        ))}
      </div>

      {/* Pattern tips */}
      {aid.tips.length > 0 && (
        <div className="space-y-1.5">
          {aid.tips.map((tip, i) => (
            <div key={i} className="text-sm">
              <span className={`font-semibold ${
                PATTERN_COLORS[((i) % 4) + 1].split(' ')[1] || 'text-sf-heading'
              }`}>
                &quot;{tip.pattern}&quot;
              </span>
              <span className="text-sf-muted"> — {tip.hint}</span>
              {tip.examples.length > 0 && (
                <span className="text-sf-muted text-sm block ml-4">
                  Also in: {tip.examples.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mnemonic Aid ────────────────────────────────────────────

function MnemonicContent({ aid }: { aid: MnemonicAid }) {
  if (aid.tricks.length === 0) {
    return <p className="text-center text-sm text-sf-muted italic">Study the word carefully!</p>;
  }

  return (
    <div className="space-y-2">
      {aid.tricks.map((trick, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="text-xs font-semibold text-sf-secondary bg-sf-surface border border-sf-border rounded-full px-2 py-0.5 whitespace-nowrap mt-0.5">
            {trick.label}
          </span>
          <p className="text-sm text-sf-heading font-medium leading-snug">
            {trick.content}
          </p>
        </div>
      ))}
    </div>
  );
}
