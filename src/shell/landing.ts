// src/shell/landing.ts: the screen the app opens on when nothing else says where (no screen kept, no share waiting). With the Tutor
// on (Settings > Developer > Tutor (preview)) it is the front-door world's entry, the door: the tutor to talk to (worlds.ts
// WORLD_ENTRY); with the Tutor off it is Home, as it has always been, so no child's app changes until the Tutor is switched on.
// The door's way out is its Home button (screens/front-door.tsx); Settings and Grown-ups are reached from Home, and Back's base stays HOME_VIEW.
import { isTutorFlagOn } from '../debug';
import { HOME_VIEW, WORLD_ENTRY, type ViewId } from './worlds';

/** The front door's own screen, the tutor to talk to. */
export const DOOR_VIEW: ViewId = WORLD_ENTRY['front-door'] ?? HOME_VIEW;

/** The screen to land on: the door with the Tutor on, else Home. */
export const landingView = (): ViewId => (isTutorFlagOn() ? DOOR_VIEW : HOME_VIEW);

/** Whether `view` is a screen of the Tutor (preview): it is only reachable, and only kept, while the Tutor is on. */
export const isTutorView = (view: ViewId): boolean => view === 'tutor' || view === 'door';
