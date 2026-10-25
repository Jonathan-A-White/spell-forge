// src/worlds/grown-ups/world-progress.ts: what each world knows of the child, for How is it going: the ids of the nodes it keeps as solid
// (the graph store each world writes, one per child on the phone). The drills of the last week are not kept with a date anywhere yet, and
// a goal is not chosen anywhere yet, so neither is handed over: HowIsItGoing then says nothing of them rather than a wrong zero.

import { useEffect, useState } from 'react';
import type { GraphStore } from 'learn-kit/graph';
import { storageGraphStore as mathsStore } from '../maths';
import { storageGraphStore as spellingStore } from '../spelling';
import type { HowIsItGoingProps, WorldProgress } from './HowIsItGoing';

async function solidProgress(store: GraphStore): Promise<WorldProgress> {
  const solid = new Set<string>();
  for (const [id, state] of await store.entries()) if (state.level === 'solid') solid.add(id);
  return { solid };
}

/** The child's progress in each world, read once when the screen opens; null until then. */
export function useWorldProgress(profileId: string): HowIsItGoingProps | null {
  const [progress, setProgress] = useState<HowIsItGoingProps | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([solidProgress(spellingStore(profileId)), solidProgress(mathsStore(profileId))]).then(([spelling, maths]) => {
      if (alive) setProgress({ spelling, maths });
    });
    return () => {
      alive = false;
    };
  }, [profileId]);
  return progress;
}
