// src/shell/WorldSwitch.tsx: the world a route is in, and the screen the route names inside it. It replaces the hand-made
// view switch App.tsx had: the table of screens is worlds.ts's, each world draws its own (src/shell/screens/).
import { useSyncExternalStore } from 'react';
import { HOME_VIEW, VIEWS, viewAtRoute, worldAtRoute, type ViewId } from './worlds';
import { WORLD_SCREENS, type WorldScreens } from './world-screens';
import { licenceState, subscribeLicence } from './licence-gate';
import { LICENCE_SOON } from './store';

/** The Grown-ups world's line about getting a licence: shown only where the licence is known to be missing. */
function GetLicence() {
  const state = useSyncExternalStore(subscribeLicence, licenceState);
  if (state !== 'unlicensed') return null;
  return (
    <p className="bg-sf-bg px-4 py-2 text-center text-sf-muted text-sm">{LICENCE_SOON}</p>
  );
}

export function WorldSwitch({ route, worlds = WORLD_SCREENS }: { route: string; worlds?: WorldScreens }) {
  const entry = viewAtRoute(route);
  const world = worldAtRoute(route);
  // A route in a world that names none of its screens, or one that no longer exists, is the front door's Home.
  const hasScreens = VIEWS.some((v) => v.world === world);
  if (!world || (!entry && hasScreens)) {
    const FrontDoor = worlds['front-door'];
    return <FrontDoor view={HOME_VIEW} />;
  }
  const World = worlds[world];
  const screen = <World view={(entry?.id as ViewId | undefined) ?? null} />;
  if (world !== 'grown-ups') return screen;
  return (
    <>
      <GetLicence />
      {screen}
    </>
  );
}
