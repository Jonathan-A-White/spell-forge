// src/shell/WorldSwitch.tsx: the world a route is in, and the screen the route names inside it. It replaces the hand-made
// view switch App.tsx had: the table of screens is worlds.ts's, each world draws its own (src/shell/screens/).
import { HOME_VIEW, VIEWS, viewAtRoute, worldAtRoute, type ViewId } from './worlds';
import { WORLD_SCREENS, type WorldScreens } from './world-screens';

export function WorldSwitch({ route, worlds = WORLD_SCREENS }: { route: string; worlds?: WorldScreens }) {
  const entry = viewAtRoute(route);
  const world = worldAtRoute(route);
  // A world with no screen yet (Maths) shows its own placeholder; any other route that no longer exists is the front door's Home.
  const hasScreens = VIEWS.some((v) => v.world === world);
  if (!world || (!entry && hasScreens)) {
    const FrontDoor = worlds['front-door'];
    return <FrontDoor view={HOME_VIEW} />;
  }
  const World = worlds[world];
  return <World view={(entry?.id as ViewId | undefined) ?? null} />;
}
