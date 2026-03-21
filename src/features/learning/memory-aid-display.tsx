// src/features/learning/memory-aid-display.tsx — Memory aid cards for Stage 0

import type {
  MemoryAid,
  PhoneticAid,
  PatternAid,
  MnemonicAid,
} from '../../contracts/types';

interface MemoryAidDisplayProps {
  aid: MemoryAid;
}

const AID_LABELS: Record<MemoryAid['type'], string> = {
  phonetic: 'Sound It Out',
  pattern: 'Pattern Spotter',
  mnemonic: 'Memory Tricks',
};

const AID_ICONS: Record<MemoryAid['type'], string> = {
  phonetic: '\uD83D\uDD0A', // speaker
  pattern: '\uD83D\uDD0D', // magnifying glass
  mnemonic: '\uD83D\uDCA1', // light bulb
};

/** Pattern highlight colors — maps colorIndex (1-4) to Tailwind classes */
const PATTERN_COLORS = [
  '', // 0 = no pattern (plain)
  'bg-blue-100 text-blue-800 border-blue-300',
  'bg-amber-100 text-amber-800 border-amber-300',
  'bg-green-100 text-green-800 border-green-300',
  'bg-purple-100 text-purple-800 border-purple-300',
];

export function MemoryAidDisplay({ aid }: MemoryAidDisplayProps) {
  return (
    <div className="w-full max-w-md mx-auto bg-sf-surface border border-sf-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">{AID_ICONS[aid.type]}</span>
        <h3 className="text-sm font-semibold text-sf-heading">{AID_LABELS[aid.type]}</h3>
      </div>

      {aid.type === 'phonetic' && <PhoneticContent aid={aid} />}
      {aid.type === 'pattern' && <PatternContent aid={aid} />}
      {aid.type === 'mnemonic' && <MnemonicContent aid={aid} />}
    </div>
  );
}

// ─── Phonetic Aid ────────────────────────────────────────────

function PhoneticContent({ aid }: { aid: PhoneticAid }) {
  return (
    <div className="space-y-2">
      {/* Syllable chunks */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {aid.chunks.map((chunk, i) => (
          <div key={i} className="flex flex-col items-center">
            <span className="text-xl font-bold text-sf-heading bg-blue-50 border border-blue-200 rounded-lg px-3 py-1">
              {chunk.text}
            </span>
            <span className="text-xs text-sf-muted mt-0.5">{chunk.pronunciation}</span>
          </div>
        ))}
      </div>
      {/* Summary */}
      <p className="text-center text-sm text-sf-muted italic">{aid.summary}</p>
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
                <span className="text-sf-muted text-xs block ml-4">
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
