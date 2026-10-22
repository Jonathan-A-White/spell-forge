// src/shell/screens/grown-ups.tsx: the grown-ups' screens: Settings, the feedback form, Share and About.
import { FeedbackForm } from '../../features/feedback/feedback-form';
import { SettingsPanel } from '../../features/settings/settings-panel';
import { SharePanel } from '../../features/settings/share-panel';
import { AboutScreen } from '../../features/about';
import { useApp } from '../app-state';
import type { ViewId } from '../worlds';

export function GrownUpsWorld({ view }: { view: ViewId | null }) {
  const app = useApp();
  const { activeProfile, setView, goBack } = app;

  switch (view) {
    case 'feedback':
      return <FeedbackForm onSubmit={app.handleFeedback} onCancel={goBack} />;

    case 'about':
      return <AboutScreen onBack={goBack} />;

    case 'share':
      return <SharePanel onBack={goBack} />;

    case 'settings':
    default:
      if (!activeProfile) return null;
      return (
        <SettingsPanel
          profile={activeProfile}
          settings={activeProfile.settings}
          importFilterWords={activeProfile.importFilterWords}
          onImportFilterWordsChange={app.handleImportFilterWordsChange}
          onContrastModeChange={app.handleContrastModeChange}
          onPresetApply={app.handlePresetApply}
          onGradeGoalChange={app.handleGradeGoalChange}
          onLearningStrategyChange={app.handleLearningStrategyChange}
          onExportProfile={app.handleExportProfile}
          onImportProfile={app.handleImportProfile}
          onShare={() => setView('share')}
          onSendFeedback={() => setView('feedback')}
          ttsDebugEnabled={app.ttsDebugEnabled}
          onToggleTtsDebug={app.toggleTtsDebug}
          debugModeEnabled={app.debugModeEnabled}
          onToggleDebugMode={app.toggleDebugMode}
          onOpenAbout={() => setView('about')}
          onBack={goBack}
        />
      );
  }
}
