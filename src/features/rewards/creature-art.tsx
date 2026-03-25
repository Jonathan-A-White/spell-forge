// src/features/rewards/creature-art.tsx — SVG creature illustrations for card collection
//
// Each theme has its own set of friendly, colorful creature designs.
// Appearance traits (bodyShape, colors, eyes, mouth, extra) are combined
// to produce unique-looking creatures from a small set of building blocks.

import type { CreatureAppearance } from '../../contracts/types';

// ─── Color Palettes ─────────────────────────────────────────

const MONSTER_BODY_COLORS = ['#9B59B6', '#3498DB', '#2ECC71', '#E74C3C', '#F39C12', '#1ABC9C'];
const MONSTER_ACCENT_COLORS = ['#D2B4DE', '#85C1E9', '#82E0AA', '#F1948A', '#F9E79F', '#76D7C4'];

const DRAGON_BODY_COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#8E44AD', '#2980B9', '#27AE60'];
const DRAGON_ACCENT_COLORS = ['#FADBD8', '#FAD7A0', '#F9E79F', '#D2B4DE', '#AED6F1', '#A9DFBF'];

const STAR_BODY_COLORS = ['#F1C40F', '#E67E22', '#3498DB', '#9B59B6', '#1ABC9C', '#EC407A'];
const STAR_ACCENT_COLORS = ['#FEF9E7', '#FDEBD0', '#D6EAF8', '#E8DAEF', '#D1F2EB', '#FDEDEC'];

interface CreatureArtProps {
  themeId: string;
  appearance: CreatureAppearance;
  size?: number;
}

const DEFAULT_APPEARANCE: CreatureAppearance = {
  bodyShape: 0, primaryColor: 0, accentColor: 0, eyes: 0, mouth: 0, extra: 0,
};

export function CreatureArt({ themeId, appearance: rawAppearance, size = 80 }: CreatureArtProps) {
  // Guard against missing/partial appearance from legacy DB records
  const appearance = rawAppearance ? { ...DEFAULT_APPEARANCE, ...rawAppearance } : DEFAULT_APPEARANCE;
  switch (themeId) {
    case 'dragon-forge':
      return <DragonArt appearance={appearance} size={size} />;
    case 'star-trail':
      return <StarArt appearance={appearance} size={size} />;
    case 'monster-lab':
    default:
      return <MonsterArt appearance={appearance} size={size} />;
  }
}

// ─── Monster Lab Creatures ──────────────────────────────────

function MonsterArt({ appearance, size }: { appearance: CreatureAppearance; size: number }) {
  const body = MONSTER_BODY_COLORS[appearance.primaryColor % MONSTER_BODY_COLORS.length];
  const accent = MONSTER_ACCENT_COLORS[appearance.accentColor % MONSTER_ACCENT_COLORS.length];
  const shape = appearance.bodyShape % 5;
  const eyeStyle = appearance.eyes % 5;
  const mouthStyle = appearance.mouth % 4;
  const extra = appearance.extra % 5;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {/* Body shapes */}
      <MonsterBody shape={shape} color={body} />
      {/* Belly/accent */}
      <MonsterBelly shape={shape} color={accent} />
      {/* Eyes */}
      <MonsterEyes style={eyeStyle} />
      {/* Mouth */}
      <MonsterMouth style={mouthStyle} />
      {/* Extra features (horns, antennae, spots) */}
      <MonsterExtra style={extra} color={body} accent={accent} />
    </svg>
  );
}

function MonsterBody({ shape, color }: { shape: number; color: string }) {
  switch (shape) {
    case 0: // Round blob
      return <ellipse cx="50" cy="55" rx="32" ry="30" fill={color} />;
    case 1: // Tall oval
      return <ellipse cx="50" cy="52" rx="25" ry="35" fill={color} />;
    case 2: // Wide squish
      return <ellipse cx="50" cy="58" rx="36" ry="24" fill={color} />;
    case 3: // Rounded square
      return <rect x="22" y="28" width="56" height="50" rx="18" fill={color} />;
    case 4: // Pear shape
      return (
        <path
          d="M50 20 C65 20 75 35 75 50 C75 70 65 82 50 82 C35 82 25 70 25 50 C25 35 35 20 50 20Z"
          fill={color}
        />
      );
    default:
      return <ellipse cx="50" cy="55" rx="32" ry="30" fill={color} />;
  }
}

function MonsterBelly({ shape, color }: { shape: number; color: string }) {
  switch (shape) {
    case 0:
      return <ellipse cx="50" cy="60" rx="18" ry="14" fill={color} />;
    case 1:
      return <ellipse cx="50" cy="58" rx="14" ry="18" fill={color} />;
    case 2:
      return <ellipse cx="50" cy="62" rx="20" ry="10" fill={color} />;
    case 3:
      return <ellipse cx="50" cy="58" rx="22" ry="16" fill={color} />;
    case 4:
      return <ellipse cx="50" cy="62" rx="16" ry="14" fill={color} />;
    default:
      return <ellipse cx="50" cy="60" rx="18" ry="14" fill={color} />;
  }
}

function MonsterEyes({ style }: { style: number }) {
  switch (style) {
    case 0: // Big round eyes
      return (
        <g>
          <circle cx="38" cy="42" r="8" fill="white" />
          <circle cx="62" cy="42" r="8" fill="white" />
          <circle cx="40" cy="42" r="4" fill="#2C3E50" />
          <circle cx="64" cy="42" r="4" fill="#2C3E50" />
          <circle cx="41" cy="40" r="1.5" fill="white" />
          <circle cx="65" cy="40" r="1.5" fill="white" />
        </g>
      );
    case 1: // One big eye (cyclops)
      return (
        <g>
          <circle cx="50" cy="42" r="12" fill="white" />
          <circle cx="52" cy="42" r="6" fill="#2C3E50" />
          <circle cx="53" cy="40" r="2" fill="white" />
        </g>
      );
    case 2: // Sleepy eyes
      return (
        <g>
          <ellipse cx="38" cy="44" rx="7" ry="5" fill="white" />
          <ellipse cx="62" cy="44" rx="7" ry="5" fill="white" />
          <ellipse cx="39" cy="44" rx="3.5" ry="3" fill="#2C3E50" />
          <ellipse cx="63" cy="44" rx="3.5" ry="3" fill="#2C3E50" />
        </g>
      );
    case 3: // Star eyes
      return (
        <g>
          <circle cx="38" cy="42" r="7" fill="white" />
          <circle cx="62" cy="42" r="7" fill="white" />
          <text x="38" y="46" textAnchor="middle" fontSize="10" fill="#F39C12">&#x2605;</text>
          <text x="62" y="46" textAnchor="middle" fontSize="10" fill="#F39C12">&#x2605;</text>
        </g>
      );
    case 4: // Dot eyes
      return (
        <g>
          <circle cx="38" cy="42" r="4" fill="#2C3E50" />
          <circle cx="62" cy="42" r="4" fill="#2C3E50" />
          <circle cx="39" cy="41" r="1.5" fill="white" />
          <circle cx="63" cy="41" r="1.5" fill="white" />
        </g>
      );
    default:
      return null;
  }
}

function MonsterMouth({ style }: { style: number }) {
  switch (style) {
    case 0: // Happy smile
      return <path d="M38 58 Q50 68 62 58" fill="none" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />;
    case 1: // Toothy grin
      return (
        <g>
          <path d="M36 56 Q50 66 64 56" fill="white" stroke="#2C3E50" strokeWidth="1.5" />
          <line x1="44" y1="56" x2="44" y2="60" stroke="#2C3E50" strokeWidth="1" />
          <line x1="50" y1="56" x2="50" y2="61" stroke="#2C3E50" strokeWidth="1" />
          <line x1="56" y1="56" x2="56" y2="60" stroke="#2C3E50" strokeWidth="1" />
        </g>
      );
    case 2: // Small O mouth
      return <ellipse cx="50" cy="58" rx="4" ry="5" fill="#2C3E50" />;
    case 3: // Tongue out
      return (
        <g>
          <path d="M38 56 Q50 66 62 56" fill="none" stroke="#2C3E50" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="50" cy="64" rx="4" ry="3" fill="#E74C3C" />
        </g>
      );
    default:
      return null;
  }
}

function MonsterExtra({ style, color, accent }: { style: number; color: string; accent: string }) {
  switch (style) {
    case 0: // Two horns
      return (
        <g>
          <path d="M35 30 L30 12 L40 26" fill={color} />
          <path d="M65 30 L70 12 L60 26" fill={color} />
        </g>
      );
    case 1: // Antennae with balls
      return (
        <g>
          <line x1="38" y1="28" x2="30" y2="10" stroke={color} strokeWidth="2" />
          <line x1="62" y1="28" x2="70" y2="10" stroke={color} strokeWidth="2" />
          <circle cx="30" cy="10" r="4" fill={accent} />
          <circle cx="70" cy="10" r="4" fill={accent} />
        </g>
      );
    case 2: // Spots
      return (
        <g>
          <circle cx="30" cy="50" r="4" fill={accent} opacity="0.6" />
          <circle cx="68" cy="48" r="3" fill={accent} opacity="0.6" />
          <circle cx="55" cy="68" r="3.5" fill={accent} opacity="0.6" />
        </g>
      );
    case 3: // Little arms
      return (
        <g>
          <path d="M20 55 Q12 50 15 42" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <path d="M80 55 Q88 50 85 42" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 4: // Tiny wings
      return (
        <g>
          <path d="M22 40 Q8 30 18 48" fill={accent} opacity="0.7" />
          <path d="M78 40 Q92 30 82 48" fill={accent} opacity="0.7" />
        </g>
      );
    default:
      return null;
  }
}

// ─── Dragon Forge Creatures ─────────────────────────────────

function DragonArt({ appearance, size }: { appearance: CreatureAppearance; size: number }) {
  const body = DRAGON_BODY_COLORS[appearance.primaryColor % DRAGON_BODY_COLORS.length];
  const accent = DRAGON_ACCENT_COLORS[appearance.accentColor % DRAGON_ACCENT_COLORS.length];
  const shape = appearance.bodyShape % 5;
  const eyeStyle = appearance.eyes % 5;
  const mouthStyle = appearance.mouth % 4;
  const extra = appearance.extra % 5;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {/* Wings */}
      <DragonWings style={extra} color={accent} />
      {/* Body */}
      <DragonBody shape={shape} color={body} />
      {/* Belly */}
      <DragonBelly shape={shape} color={accent} />
      {/* Eyes */}
      <DragonEyes style={eyeStyle} />
      {/* Mouth / snout detail */}
      <DragonMouth style={mouthStyle} color={body} />
      {/* Horns / spikes */}
      <DragonHorns style={shape} color={body} />
    </svg>
  );
}

function DragonBody({ shape, color }: { shape: number; color: string }) {
  switch (shape) {
    case 0: // Chubby dragon
      return <ellipse cx="50" cy="55" rx="28" ry="26" fill={color} />;
    case 1: // Tall dragon
      return <ellipse cx="50" cy="50" rx="22" ry="32" fill={color} />;
    case 2: // Round baby dragon
      return <circle cx="50" cy="52" r="28" fill={color} />;
    case 3: // Egg-shaped
      return (
        <path
          d="M50 22 C70 22 76 42 76 56 C76 72 64 82 50 82 C36 82 24 72 24 56 C24 42 30 22 50 22Z"
          fill={color}
        />
      );
    case 4: // Squat dragon
      return <ellipse cx="50" cy="58" rx="30" ry="22" fill={color} />;
    default:
      return <ellipse cx="50" cy="55" rx="28" ry="26" fill={color} />;
  }
}

function DragonBelly({ shape, color }: { shape: number; color: string }) {
  switch (shape) {
    case 0:
      return <ellipse cx="50" cy="60" rx="16" ry="12" fill={color} />;
    case 1:
      return <ellipse cx="50" cy="58" rx="12" ry="16" fill={color} />;
    case 2:
      return <ellipse cx="50" cy="58" rx="16" ry="14" fill={color} />;
    case 3:
      return <ellipse cx="50" cy="62" rx="14" ry="14" fill={color} />;
    case 4:
      return <ellipse cx="50" cy="62" rx="18" ry="10" fill={color} />;
    default:
      return <ellipse cx="50" cy="60" rx="16" ry="12" fill={color} />;
  }
}

function DragonEyes({ style }: { style: number }) {
  switch (style) {
    case 0: // Fierce but cute
      return (
        <g>
          <ellipse cx="38" cy="42" rx="6" ry="7" fill="white" />
          <ellipse cx="62" cy="42" rx="6" ry="7" fill="white" />
          <ellipse cx="40" cy="42" rx="3" ry="4" fill="#C0392B" />
          <ellipse cx="64" cy="42" rx="3" ry="4" fill="#C0392B" />
          <circle cx="41" cy="40" r="1.2" fill="white" />
          <circle cx="65" cy="40" r="1.2" fill="white" />
        </g>
      );
    case 1: // Friendly round
      return (
        <g>
          <circle cx="38" cy="42" r="7" fill="white" />
          <circle cx="62" cy="42" r="7" fill="white" />
          <circle cx="39" cy="43" r="4" fill="#E67E22" />
          <circle cx="63" cy="43" r="4" fill="#E67E22" />
          <circle cx="40" cy="41" r="1.5" fill="white" />
          <circle cx="64" cy="41" r="1.5" fill="white" />
        </g>
      );
    case 2: // Determined
      return (
        <g>
          <ellipse cx="38" cy="43" rx="6" ry="5" fill="white" />
          <ellipse cx="62" cy="43" rx="6" ry="5" fill="white" />
          <circle cx="39" cy="43" r="3" fill="#2C3E50" />
          <circle cx="63" cy="43" r="3" fill="#2C3E50" />
          <line x1="32" y1="38" x2="44" y2="40" stroke="#2C3E50" strokeWidth="1.5" />
          <line x1="68" y1="38" x2="56" y2="40" stroke="#2C3E50" strokeWidth="1.5" />
        </g>
      );
    case 3: // Happy squint
      return (
        <g>
          <path d="M32 42 Q38 38 44 42" fill="none" stroke="#2C3E50" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M56 42 Q62 38 68 42" fill="none" stroke="#2C3E50" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case 4: // Wide sparkle
      return (
        <g>
          <circle cx="38" cy="42" r="8" fill="white" />
          <circle cx="62" cy="42" r="8" fill="white" />
          <circle cx="39" cy="42" r="5" fill="#F39C12" />
          <circle cx="63" cy="42" r="5" fill="#F39C12" />
          <circle cx="40" cy="40" r="2" fill="white" />
          <circle cx="64" cy="40" r="2" fill="white" />
        </g>
      );
    default:
      return null;
  }
}

function DragonMouth({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Snout with smile
      return (
        <g>
          <ellipse cx="50" cy="54" rx="10" ry="6" fill={color} opacity="0.7" />
          <path d="M42 58 Q50 64 58 58" fill="none" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      );
    case 1: // Toothy grin with fangs
      return (
        <g>
          <path d="M40 56 Q50 64 60 56" fill="white" stroke="#2C3E50" strokeWidth="1" />
          <path d="M42 56 L44 60" stroke="#2C3E50" strokeWidth="1" />
          <path d="M58 56 L56 60" stroke="#2C3E50" strokeWidth="1" />
        </g>
      );
    case 2: // Little flame
      return (
        <g>
          <path d="M42 56 Q50 62 58 56" fill="none" stroke="#2C3E50" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M54 58 Q58 54 56 48 Q60 56 58 60" fill="#F39C12" opacity="0.8" />
        </g>
      );
    case 3: // Happy open mouth
      return <ellipse cx="50" cy="58" rx="6" ry="4" fill="#C0392B" />;
    default:
      return null;
  }
}

function DragonWings({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Small bat wings
      return (
        <g>
          <path d="M22 40 Q6 25 12 45 Q14 38 22 48" fill={color} opacity="0.8" />
          <path d="M78 40 Q94 25 88 45 Q86 38 78 48" fill={color} opacity="0.8" />
        </g>
      );
    case 1: // Feathery wings
      return (
        <g>
          <path d="M22 42 Q10 30 8 42 Q6 34 14 46 L22 50" fill={color} opacity="0.7" />
          <path d="M78 42 Q90 30 92 42 Q94 34 86 46 L78 50" fill={color} opacity="0.7" />
        </g>
      );
    case 2: // Tiny nubs
      return (
        <g>
          <ellipse cx="22" cy="44" rx="6" ry="8" fill={color} opacity="0.6" />
          <ellipse cx="78" cy="44" rx="6" ry="8" fill={color} opacity="0.6" />
        </g>
      );
    case 3: // Big spread wings
      return (
        <g>
          <path d="M24 38 Q4 18 8 38 Q2 28 16 48 L24 50" fill={color} opacity="0.7" />
          <path d="M76 38 Q96 18 92 38 Q98 28 84 48 L76 50" fill={color} opacity="0.7" />
        </g>
      );
    case 4: // No wings (baby dragon)
      return null;
    default:
      return null;
  }
}

function DragonHorns({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0:
      return (
        <g>
          <path d="M38 30 L34 14 L42 26" fill={color} />
          <path d="M62 30 L66 14 L58 26" fill={color} />
        </g>
      );
    case 1:
      return <path d="M44 22 L50 8 L56 22" fill={color} />;
    case 2:
      return (
        <g>
          <circle cx="36" cy="26" r="4" fill={color} />
          <circle cx="64" cy="26" r="4" fill={color} />
        </g>
      );
    case 3:
      return (
        <g>
          <path d="M36 28 L28 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <path d="M64 28 L72 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <path d="M50 24 L50 8" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 4:
      return (
        <g>
          <path d="M40 26 L36 16 L44 22" fill={color} opacity="0.7" />
          <path d="M60 26 L64 16 L56 22" fill={color} opacity="0.7" />
        </g>
      );
    default:
      return null;
  }
}

// ─── Star Trail Creatures ───────────────────────────────────

function StarArt({ appearance, size }: { appearance: CreatureAppearance; size: number }) {
  const body = STAR_BODY_COLORS[appearance.primaryColor % STAR_BODY_COLORS.length];
  const accent = STAR_ACCENT_COLORS[appearance.accentColor % STAR_ACCENT_COLORS.length];
  const shape = appearance.bodyShape % 5;
  const eyeStyle = appearance.eyes % 5;
  const mouthStyle = appearance.mouth % 4;
  const extra = appearance.extra % 5;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {/* Glow */}
      <StarGlow color={body} />
      {/* Body shape */}
      <StarBody shape={shape} color={body} accent={accent} />
      {/* Eyes */}
      <StarEyes style={eyeStyle} />
      {/* Mouth */}
      <StarMouth style={mouthStyle} />
      {/* Sparkle extras */}
      <StarExtra style={extra} color={body} accent={accent} />
    </svg>
  );
}

function StarGlow({ color }: { color: string }) {
  return <circle cx="50" cy="50" r="40" fill={color} opacity="0.12" />;
}

function StarBody({ shape, color, accent }: { shape: number; color: string; accent: string }) {
  switch (shape) {
    case 0: // Classic 5-point star body
      return (
        <g>
          <polygon
            points="50,14 58,38 84,38 64,52 72,78 50,62 28,78 36,52 16,38 42,38"
            fill={color}
          />
          <circle cx="50" cy="48" r="12" fill={accent} opacity="0.5" />
        </g>
      );
    case 1: // Round star creature
      return (
        <g>
          <circle cx="50" cy="50" r="24" fill={color} />
          {/* Small star points */}
          <polygon points="50,20 53,30 50,26 47,30" fill={color} />
          <polygon points="50,80 53,70 50,74 47,70" fill={color} />
          <polygon points="20,50 30,47 26,50 30,53" fill={color} />
          <polygon points="80,50 70,47 74,50 70,53" fill={color} />
          <circle cx="50" cy="50" r="14" fill={accent} opacity="0.4" />
        </g>
      );
    case 2: // Crescent moon creature
      return (
        <g>
          <circle cx="50" cy="50" r="26" fill={color} />
          <circle cx="58" cy="42" r="18" fill={accent} opacity="0.3" />
        </g>
      );
    case 3: // Diamond-ish
      return (
        <g>
          <polygon points="50,18 78,50 50,82 22,50" rx="8" fill={color} />
          <polygon points="50,30 68,50 50,70 32,50" fill={accent} opacity="0.3" />
        </g>
      );
    case 4: // Cloud-star hybrid
      return (
        <g>
          <circle cx="42" cy="52" r="20" fill={color} />
          <circle cx="58" cy="52" r="20" fill={color} />
          <circle cx="50" cy="42" r="18" fill={color} />
          <ellipse cx="50" cy="52" rx="18" ry="12" fill={accent} opacity="0.3" />
        </g>
      );
    default:
      return <circle cx="50" cy="50" r="24" fill={color} />;
  }
}

function StarEyes({ style }: { style: number }) {
  switch (style) {
    case 0: // Twinkling
      return (
        <g>
          <circle cx="40" cy="46" r="5" fill="white" />
          <circle cx="60" cy="46" r="5" fill="white" />
          <circle cx="41" cy="46" r="3" fill="#1A237E" />
          <circle cx="61" cy="46" r="3" fill="#1A237E" />
          <circle cx="42" cy="44" r="1.2" fill="white" />
          <circle cx="62" cy="44" r="1.2" fill="white" />
        </g>
      );
    case 1: // Starry eyes
      return (
        <g>
          <circle cx="40" cy="46" r="6" fill="white" />
          <circle cx="60" cy="46" r="6" fill="white" />
          <text x="40" y="49" textAnchor="middle" fontSize="8" fill="#F1C40F">&#x2605;</text>
          <text x="60" y="49" textAnchor="middle" fontSize="8" fill="#F1C40F">&#x2605;</text>
        </g>
      );
    case 2: // Crescent eyes (happy)
      return (
        <g>
          <path d="M34 46 Q40 42 46 46" fill="none" stroke="#1A237E" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 46 Q60 42 66 46" fill="none" stroke="#1A237E" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case 3: // Big sparkle eyes
      return (
        <g>
          <circle cx="40" cy="46" r="7" fill="white" />
          <circle cx="60" cy="46" r="7" fill="white" />
          <circle cx="41" cy="46" r="4" fill="#3498DB" />
          <circle cx="61" cy="46" r="4" fill="#3498DB" />
          <circle cx="42" cy="44" r="2" fill="white" />
          <circle cx="62" cy="44" r="2" fill="white" />
          <circle cx="39" cy="48" r="1" fill="white" />
          <circle cx="59" cy="48" r="1" fill="white" />
        </g>
      );
    case 4: // Dot eyes
      return (
        <g>
          <circle cx="40" cy="46" r="3" fill="#1A237E" />
          <circle cx="60" cy="46" r="3" fill="#1A237E" />
        </g>
      );
    default:
      return null;
  }
}

function StarMouth({ style }: { style: number }) {
  switch (style) {
    case 0:
      return <path d="M42 56 Q50 62 58 56" fill="none" stroke="#1A237E" strokeWidth="1.5" strokeLinecap="round" />;
    case 1:
      return <circle cx="50" cy="56" r="3" fill="#1A237E" />;
    case 2:
      return <path d="M44 54 Q50 58 56 54" fill="none" stroke="#1A237E" strokeWidth="1.5" strokeLinecap="round" />;
    case 3:
      return (
        <g>
          <path d="M44 55 Q50 62 56 55" fill="#E91E63" opacity="0.6" />
          <path d="M44 55 Q50 62 56 55" fill="none" stroke="#1A237E" strokeWidth="1" />
        </g>
      );
    default:
      return null;
  }
}

function StarExtra({ style, color, accent }: { style: number; color: string; accent: string }) {
  switch (style) {
    case 0: // Orbiting sparkles
      return (
        <g>
          <circle cx="18" cy="28" r="2.5" fill={color} opacity="0.7" />
          <circle cx="82" cy="32" r="2" fill={color} opacity="0.6" />
          <circle cx="24" cy="76" r="1.5" fill={color} opacity="0.5" />
          <circle cx="78" cy="72" r="2" fill={color} opacity="0.6" />
        </g>
      );
    case 1: // Ring/halo
      return <circle cx="50" cy="50" r="36" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.4" />;
    case 2: // Trailing sparkle dust
      return (
        <g>
          <circle cx="14" cy="60" r="1.5" fill={color} opacity="0.4" />
          <circle cx="20" cy="68" r="2" fill={color} opacity="0.5" />
          <circle cx="12" cy="74" r="1" fill={color} opacity="0.3" />
          <circle cx="86" cy="58" r="1.5" fill={color} opacity="0.4" />
          <circle cx="82" cy="66" r="2" fill={color} opacity="0.5" />
        </g>
      );
    case 3: // Crown points
      return (
        <g>
          <polygon points="40,18 42,10 44,18" fill={color} opacity="0.7" />
          <polygon points="48,14 50,6 52,14" fill={color} opacity="0.7" />
          <polygon points="56,18 58,10 60,18" fill={color} opacity="0.7" />
        </g>
      );
    case 4: // Comet tail
      return (
        <path
          d="M26 72 Q10 82 4 90"
          fill="none"
          stroke={accent}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.4"
        />
      );
    default:
      return null;
  }
}

// ─── Rarity Badge ───────────────────────────────────────────

const RARITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  common: { bg: '#6B7280', text: '#F3F4F6', border: '#9CA3AF' },
  uncommon: { bg: '#059669', text: '#ECFDF5', border: '#34D399' },
  rare: { bg: '#2563EB', text: '#EFF6FF', border: '#60A5FA' },
  epic: { bg: '#7C3AED', text: '#F5F3FF', border: '#A78BFA' },
  legendary: { bg: '#D97706', text: '#FFFBEB', border: '#FBBF24' },
};

export function RarityBadge({ rarity }: { rarity: string }) {
  const colors = RARITY_COLORS[rarity] ?? RARITY_COLORS.common;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
      }}
    >
      {rarity}
    </span>
  );
}

export function LevelStars({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Level ${level}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 16 16" width="12" height="12">
          <polygon
            points="8,1 10,6 15,6 11,9 12.5,15 8,11.5 3.5,15 5,9 1,6 6,6"
            fill={i < level ? '#F59E0B' : '#374151'}
            opacity={i < level ? 1 : 0.3}
          />
        </svg>
      ))}
    </span>
  );
}
