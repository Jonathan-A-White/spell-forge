// src/shell/landing.ts: the screen the app opens on when nothing else says where (no screen kept, no share waiting). It is the front-door
// world's entry, the door: the tutor to talk to (worlds.ts WORLD_ENTRY), for everyone, with no switch to find. Only a licence known to be
// missing lands on Home instead, since the tutor cannot talk (licence-gate.ts; an unknown licence refuses nothing, so it lands on the door).
// The door's way out is its Home button (screens/front-door.tsx); Settings and Grown-ups are reached from Home, and Back's base stays HOME_VIEW.
import { licenceState } from './licence-gate';
import { HOME_VIEW, WORLD_ENTRY, type ViewId } from './worlds';

/** The front door's own screen, the tutor to talk to. */
export const DOOR_VIEW: ViewId = WORLD_ENTRY['front-door'] ?? HOME_VIEW;

/** The screen to land on: the door, or Home while the licence is known to be missing. */
export const landingView = (): ViewId => (licenceState() === 'unlicensed' ? HOME_VIEW : DOOR_VIEW);
