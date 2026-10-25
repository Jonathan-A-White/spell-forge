// src/worlds/grown-ups/GrownUps.tsx: the Grown-ups world's door. Nothing in it opens without the grown-up's PIN
// (src/features/tutor/parent-gate.tsx, parent-pin.ts); once through, the screen is parent-screen.tsx.

import type { Profile } from '../../contracts';
import { ParentGate } from '../../features/tutor/parent-gate';
import type { ParentAskDeps } from '../../features/tutor/parent-ask-flow';

export interface GrownUpsProps {
  /** The child whose sessions the screen shows. */
  profileId: string;
  /** Leave the Grown-ups world. */
  onExit: () => void;
  /** The profile's settings changed here: the screen that opened this keeps its own copy. */
  onProfileChange?: (profile: Profile) => void;
  /** The seams Ask the tutor runs on; the real grist client when absent. */
  deps?: ParentAskDeps;
}

export function GrownUps({ profileId, onExit, onProfileChange, deps }: GrownUpsProps) {
  return <ParentGate profileId={profileId} onExit={onExit} onProfileChange={onProfileChange} deps={deps} />;
}
