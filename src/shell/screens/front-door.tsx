// src/shell/screens/front-door.tsx: the front door's screens: the moments before a child is in (loading, a blocked
// database, the welcome, the choice of child), Home, and the tutor.
import { FirstRun } from '../../features/onboarding/first-run';
import { ProfileSelector } from '../../features/profiles/profile-selector';
import { HomeScreen } from '../../features/dashboard/home-screen';
import { TutorScreen } from '../../features/tutor';
import { useApp } from '../app-state';
import { openView, type ViewId } from '../worlds';

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
        <ProfileSelector
          profiles={app.profiles}
          archivedProfiles={app.archivedProfiles}
          onSelect={app.pickProfile}
          onAddProfile={() => setView('onboarding')}
          onArchiveProfile={app.handleArchiveProfile}
          onRestoreProfile={app.handleRestoreProfile}
          onDeleteProfile={app.handleDeleteProfile}
        />
      );

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
