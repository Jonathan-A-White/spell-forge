import type { CompletedCreature } from '../../contracts/types.ts';
import { themeProgressRepo } from '../../data/repositories/theme-progress-repo.ts';

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

/** In-memory store of completed creatures, keyed by profileId. */
const collectionStore: Map<string, CompletedCreature[]> = new Map();

function generateCreatureName(): string {
  const adj = CREATURE_ADJECTIVES[Math.floor(Math.random() * CREATURE_ADJECTIVES.length)];
  const noun = CREATURE_NOUNS[Math.floor(Math.random() * CREATURE_NOUNS.length)];
  return `${adj} ${noun}`;
}

function generateId(): string {
  return `creature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addCreature(profileId: string, themeId: string, totalBlocksUsed: number): CompletedCreature {
  const creature: CompletedCreature = {
    id: generateId(),
    profileId,
    themeId,
    name: generateCreatureName(),
    completedAt: new Date(),
    totalBlocksUsed,
  };

  const existing = collectionStore.get(profileId) ?? [];
  existing.push(creature);
  collectionStore.set(profileId, existing);

  // Persist to IndexedDB (fire-and-forget)
  themeProgressRepo.saveCreature(creature).catch(() => {
    // Silently ignore — in-memory state is still correct
  });

  return creature;
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
 * Load persisted creatures from IndexedDB into the in-memory store.
 * Call this when selecting / switching profiles.
 */
async function hydrateProfile(profileId: string): Promise<void> {
  const creatures = await themeProgressRepo.getCreatures(profileId);
  if (creatures.length > 0) {
    collectionStore.set(profileId, creatures);
  }
}

export const monsterCollection = {
  addCreature,
  getCollection,
  getCollectionCount,
  resetCollection,
  resetAll,
  generateCreatureName,
  hydrateProfile,
} as const;
