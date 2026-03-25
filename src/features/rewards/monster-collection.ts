import type { CompletedCreature, CreatureAppearance, CreatureRarity } from '../../contracts/types.ts';
import { themeProgressRepo } from '../../data/repositories/theme-progress-repo.ts';

// ─── Name Generation ────────────────────────────────────────

const CREATURE_ADJECTIVES = [
  'Sparky', 'Fuzzy', 'Gloopy', 'Chompy', 'Slimy',
  'Zippy', 'Bumpy', 'Spiky', 'Wiggly', 'Snappy',
  'Bubbly', 'Crunchy', 'Fizzy', 'Glowy', 'Wobbly',
  'Puffy', 'Scaly', 'Twisty', 'Bouncy', 'Frosty',
];

const CREATURE_NOUNS = [
  'Blob', 'Fang', 'Claw', 'Wing', 'Horn',
  'Tail', 'Snout', 'Paw', 'Tooth', 'Scale',
  'Spike', 'Shell', 'Fin', 'Tusk', 'Maw',
  'Gloop', 'Zap', 'Crunch', 'Fluff', 'Spark',
];

// ─── Rarity Weights ─────────────────────────────────────────

const RARITY_TABLE: { rarity: CreatureRarity; weight: number }[] = [
  { rarity: 'common', weight: 45 },
  { rarity: 'uncommon', weight: 28 },
  { rarity: 'rare', weight: 16 },
  { rarity: 'epic', weight: 8 },
  { rarity: 'legendary', weight: 3 },
];

// ─── Level Weights ──────────────────────────────────────────

const LEVEL_TABLE = [
  { level: 1, weight: 35 },
  { level: 2, weight: 28 },
  { level: 3, weight: 20 },
  { level: 4, weight: 12 },
  { level: 5, weight: 5 },
];

// ─── In-Memory Store ────────────────────────────────────────

const collectionStore: Map<string, CompletedCreature[]> = new Map();

// ─── Random Helpers ─────────────────────────────────────────

function pickWeighted<T>(table: { weight: number }[] & T[]): T {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

function generateCreatureName(): string {
  const adj = CREATURE_ADJECTIVES[randomInt(CREATURE_ADJECTIVES.length)];
  const noun = CREATURE_NOUNS[randomInt(CREATURE_NOUNS.length)];
  return `${adj} ${noun}`;
}

function generateId(): string {
  return `creature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generatePackId(): string {
  return `pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateAppearance(): CreatureAppearance {
  return {
    bodyShape: randomInt(5),
    primaryColor: randomInt(6),
    accentColor: randomInt(6),
    eyes: randomInt(5),
    mouth: randomInt(4),
    extra: randomInt(5),
  };
}

function generateRarity(): CreatureRarity {
  return pickWeighted(RARITY_TABLE).rarity;
}

function generateLevel(): number {
  return pickWeighted(LEVEL_TABLE).level;
}

// ─── Core API ───────────────────────────────────────────────

/**
 * Create a single creature with random traits.
 * Used internally and for backward compatibility.
 */
function addCreature(profileId: string, themeId: string, totalBlocksUsed: number): CompletedCreature {
  const creature: CompletedCreature = {
    id: generateId(),
    profileId,
    themeId,
    name: generateCreatureName(),
    completedAt: new Date(),
    totalBlocksUsed,
    level: generateLevel(),
    rarity: generateRarity(),
    appearance: generateAppearance(),
  };

  const existing = collectionStore.get(profileId) ?? [];
  existing.push(creature);
  collectionStore.set(profileId, existing);

  themeProgressRepo.saveCreature(creature).catch(() => {
    // Silently ignore — in-memory state is still correct
  });

  return creature;
}

/**
 * Open a pack of 3 creatures at once.
 * Guaranteed: at least one uncommon+ in every pack.
 */
function openPack(profileId: string, themeId: string, totalBlocksUsed: number): CompletedCreature[] {
  const packId = generatePackId();
  const pack: CompletedCreature[] = [];

  for (let i = 0; i < 3; i++) {
    const creature: CompletedCreature = {
      id: generateId(),
      profileId,
      themeId,
      name: generateCreatureName(),
      completedAt: new Date(),
      totalBlocksUsed,
      level: generateLevel(),
      rarity: generateRarity(),
      appearance: generateAppearance(),
      packId,
    };
    pack.push(creature);
  }

  // Guarantee at least one uncommon+ card
  const hasGood = pack.some((c) => c.rarity !== 'common');
  if (!hasGood) {
    pack[2] = { ...pack[2], rarity: 'uncommon' };
  }

  const existing = collectionStore.get(profileId) ?? [];
  for (const creature of pack) {
    existing.push(creature);
    themeProgressRepo.saveCreature(creature).catch(() => {
      // Silently ignore
    });
  }
  collectionStore.set(profileId, existing);

  return pack;
}

function getCollection(profileId: string): CompletedCreature[] {
  return collectionStore.get(profileId) ?? [];
}

function getCollectionCount(profileId: string): number {
  return getCollection(profileId).length;
}

function resetCollection(profileId: string): void {
  collectionStore.delete(profileId);
}

function resetAll(): void {
  collectionStore.clear();
}

/**
 * Migrate a creature loaded from DB that may lack new fields (level, rarity, appearance).
 * Old creatures stored before the card-collection update won't have these.
 */
function migrateCreature(raw: Record<string, unknown>): CompletedCreature {
  const creature = raw as unknown as CompletedCreature;
  return {
    ...creature,
    level: creature.level ?? (1 + (Math.abs(hashString(creature.id)) % 5)),
    rarity: creature.rarity ?? assignLegacyRarity(creature.id),
    appearance: creature.appearance ?? generateAppearanceFromSeed(creature.id),
    packId: creature.packId ?? undefined,
  };
}

/** Deterministic hash for stable migration (same creature always gets same traits). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

function assignLegacyRarity(id: string): CreatureRarity {
  const h = Math.abs(hashString(id)) % 100;
  if (h < 45) return 'common';
  if (h < 73) return 'uncommon';
  if (h < 89) return 'rare';
  if (h < 97) return 'epic';
  return 'legendary';
}

function generateAppearanceFromSeed(id: string): CreatureAppearance {
  const h = Math.abs(hashString(id));
  return {
    bodyShape: h % 5,
    primaryColor: (h >> 3) % 6,
    accentColor: (h >> 6) % 6,
    eyes: (h >> 9) % 5,
    mouth: (h >> 12) % 4,
    extra: (h >> 15) % 5,
  };
}

async function hydrateProfile(profileId: string): Promise<void> {
  const rawCreatures = await themeProgressRepo.getCreatures(profileId);
  if (rawCreatures.length > 0) {
    const migrated = rawCreatures.map((c) => migrateCreature(c as unknown as Record<string, unknown>));
    collectionStore.set(profileId, migrated);
  }
}

export const monsterCollection = {
  addCreature,
  openPack,
  getCollection,
  getCollectionCount,
  resetCollection,
  resetAll,
  generateCreatureName,
  hydrateProfile,
} as const;
