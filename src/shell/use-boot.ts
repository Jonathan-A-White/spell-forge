// src/shell/use-boot.ts: opening the app. The database first (a second tab holding an older version blocks it), a
// share another app parked, then the profiles: none is the welcome, one or the last-used opens at once, else the
// choice. It opens on the screen he was on when he left (last-route.ts), unless a share is waiting for the tutor: that
// lands on the front door's talk (landing.ts), as does an app with nothing kept while the Tutor is on.
import { useState, useEffect, useCallback, useRef, type MutableRefObject } from 'react';
import type { AccessibilitySettings } from '../contracts/types';
import { openDatabase } from '../data/db';
import { profileRepo } from '../data/repositories/profile-repo';
import { shareIdFromHash, takeShare } from '../share/share-target';
import type { SharedItem } from '../share/share-target';
import { isTutorFlagOn } from '../debug';
import { restoreLastRoute } from './last-route';
import { DOOR_VIEW, isTutorView, landingView } from './landing';
import type { Learner } from './use-learner';
import type { ViewId } from './worlds';

export function useBoot(learner: Learner, setView: (view: ViewId) => void, landingRef: MutableRefObject<ViewId | null>) {
  const { selectProfile, setProfiles, setArchivedProfiles } = learner;
  // Something another app shared with SpellForge (src/share), taken at boot: the front door opens with it waiting instead of Home.
  const [shared, setShared] = useState<SharedItem | null>(null);
  const shareLanding = useRef(false);

  // Load initial data: explicitly open DB first, then load profiles
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Step 1: Explicitly open the database, handling the blocked event
      try {
        await openDatabase(() => {
          // Another tab holds an older DB version open — show a helpful message
          if (!cancelled) setView('db-blocked');
        });
      } catch {
        if (!cancelled) {
          // DB failed to open (e.g. corrupted, permissions) — fall back to onboarding
          setView('onboarding');
        }
        return;
      }

      if (cancelled) return;

      // A share from another app opened the page (src/share/share-target.ts): its id is in the address, which rebuilding the history
      // below rewrites without the hash, so it is read first.
      const shareId = shareIdFromHash(window.location.hash);

      // Where he was when he left; the history he walked is put back under it.
      let resume = restoreLastRoute(landingView());
      if (isTutorView(resume) && !isTutorFlagOn()) resume = 'home';

      // Take the share once. While the Tutor is off it is dropped, and Home opens as usual.
      if (shareId) {
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
        const item = await takeShare(shareId);
        // Kept even when this run was cancelled (React's strict remount): the address is already cleared, so the next run would not find the share.
        if (item && isTutorFlagOn()) {
          shareLanding.current = true;
          setShared(item);
        }
        if (cancelled) return;
      }
      // A share waiting for the tutor wins over where he left off.
      const open = async (profile: Parameters<typeof selectProfile>[0]) => {
        landingRef.current = shareLanding.current ? DOOR_VIEW : resume;
        shareLanding.current = false;
        await selectProfile(profile);
      };

      // Step 2: DB is open — load profiles
      try {
        const profs = await profileRepo.getActive();
        const archived = await profileRepo.getArchived();
        if (cancelled) return;
        setProfiles(profs);
        setArchivedProfiles(archived);

        if (profs.length === 0) {
          setView('onboarding');
        } else if (profs.length === 1) {
          await open(profs[0]);
        } else {
          // Try to restore the last-used profile
          const lastId = localStorage.getItem('sf-last-profile');
          const lastProfile = lastId ? profs.find((p) => p.id === lastId) : null;
          if (lastProfile) {
            await open(lastProfile);
          } else {
            setView('profile-select');
          }
        }
      } catch {
        if (!cancelled) {
          setView('onboarding');
        }
      }
    }
    load();

    return () => { cancelled = true; };
  }, [selectProfile, setView, landingRef, setProfiles, setArchivedProfiles]);

  // A share that came with the page but no profile was chosen yet still lands on the tutor once he picks one.
  const pickProfile = useCallback(
    async (profile: Parameters<typeof selectProfile>[0]) => {
      landingRef.current = shareLanding.current ? DOOR_VIEW : null;
      shareLanding.current = false;
      await selectProfile(profile);
    },
    [selectProfile, landingRef],
  );

  const handleOnboardingComplete = useCallback(
    async (name: string, themeId: string, settings: AccessibilitySettings) => {
      const profile = await profileRepo.createLearner(name, themeId, settings);
      setProfiles([profile]);
      await pickProfile(profile);
    },
    [pickProfile, setProfiles],
  );

  return { shared, setShared, pickProfile, handleOnboardingComplete };
}
