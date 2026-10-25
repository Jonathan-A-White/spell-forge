// src/shell/screens/front-door.tsx: the front door's screens: the moments before a child is in (loading, a blocked
// database, the welcome, the choice of child), the door (the tutor to talk to, the world's landing view), Home, and the old
// Tutor screen (the last two stay until the sweep removes them).
import { useCallback, useMemo } from 'react';
import { FirstRun } from '../../features/onboarding/first-run';
import { WhoIsLearning } from '../../worlds/grown-ups/WhoIsLearning';
import { HomeScreen } from '../../features/dashboard/home-screen';
import { TutorScreen } from '../../features/tutor';
import { FrontDoor } from '../../features/front-door/FrontDoor';
import { createFrontDoorFlow } from '../../features/front-door/front-door-flow';
import { createTutorTalkSend } from '../../features/front-door/tutor-talk-send';
import { MATHS_GOALS } from '../../learn/maths';
import { useApp } from '../app-state';
import { screenContext } from '../report-screen';
import { openView, type ViewId } from '../worlds';

/** The door: the tutor, drawn by FrontDoor over the real flow and the mill. A share taken at boot waits on it for a tap. */
function Door({ profileId }: { profileId: string }) {
  const { setView, shared, setShared } = useApp();
  const send = useMemo(() => createTutorTalkSend(), []);
  const flow = useMemo(
    () =>
      createFrontDoorFlow({
        send,
        profileId,
        open: setView,
        context: () => ({ goals: MATHS_GOALS.map(({ id, title }) => ({ id, title })), ...screenContext() }),
      }),
    [send, profileId, setView],
  );
  const sharedUsed = useCallback(() => setShared(null), [setShared]);
  return <FrontDoor flow={flow} open={setView} shared={shared} onSharedUsed={sharedUsed} />;
}

export function FrontDoorWorld({ view }: { view: ViewId | null }) {
  const app = useApp();
  const { activeProfile, setView } = app;

  switch (view) {
    case 'loading':
      return (
        <div className="min-h-screen bg-sf-bg flex items-center justify-center">
          <p className="text-sf-text text-lg">Loading...</p>
        </div>
      );

    case 'db-blocked':
      return (
        <div className="min-h-screen bg-sf-bg flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <p className="text-sf-text text-lg font-bold mb-2">Waiting for other tabs</p>
            <p className="text-sf-text text-sm mb-4">
              SpellForge is open in another tab. Please close it there, then tap the button below.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-sf-primary text-white rounded-lg font-semibold"
            >
              Retry
            </button>
          </div>
        </div>
      );

    case 'onboarding':
      return <FirstRun onComplete={app.handleOnboardingComplete} />;

    case 'profile-select':
      return (
        <WhoIsLearning
          learners={app.profiles}
          archived={app.archivedProfiles}
          activeId={activeProfile?.id}
          onSwitch={app.pickProfile}
          onAdd={() => setView('onboarding')}
          onArchive={app.handleArchiveProfile}
          onRestore={app.handleRestoreProfile}
          onDelete={app.handleDeleteProfile}
        />
      );

    case 'door':
      if (!activeProfile) return null;
      return <Door key={activeProfile.id} profileId={activeProfile.id} />;

    case 'tutor':
      if (!activeProfile) return null;
      return (
        <TutorScreen
          profile={activeProfile}
          onBack={app.goBack}
          onProfileChange={app.setActiveProfile}
          shared={app.shared}
          onSharedUsed={() => app.setShared(null)}
        />
      );

    case 'home':
    default:
      if (!activeProfile) return null;
      return (
        <HomeScreen
          profile={activeProfile}
          wordLists={app.wordLists}
          allWords={app.allWords}
          allStats={app.allStats}
          streakData={app.streakData}
          coinBalance={app.coinBalance}
          learningProgress={app.learningProgress}
          gradeGoal={activeProfile.gradeGoal}
          onNavigate={(target, wordFilter) => { if (wordFilter) app.setPracticeWordFilter(wordFilter); openView(target, setView); }}
          onSwitchProfile={() => setView('profile-select')}
          hasMultipleProfiles={app.profiles.length > 1}
        />
      );
  }
}
