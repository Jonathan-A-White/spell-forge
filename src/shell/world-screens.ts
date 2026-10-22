// src/shell/world-screens.ts: which component draws each world.
import type { ComponentType } from 'react';
import type { ViewId, WorldId } from './worlds';
import { FrontDoorWorld } from './screens/front-door';
import { SpellingWorld } from './screens/spelling';
import { GrownUpsWorld } from './screens/grown-ups';
import { MathsWorld } from './screens/maths';

/** A world: draws the screen of its own that `view` names (null when the route names none of its screens). */
export type WorldScreens = Record<WorldId, ComponentType<{ view: ViewId | null }>>;

export const WORLD_SCREENS: WorldScreens = {
  'front-door': FrontDoorWorld,
  spelling: SpellingWorld,
  maths: MathsWorld,
  'grown-ups': GrownUpsWorld,
};
