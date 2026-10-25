// src/shell/screens/grown-ups.tsx: the grown-ups' screens: Settings, Conversations, Requests to the maker, Share and About.
import { useEffect, useMemo } from 'react';
import { GROWN_UP } from 'pwa-kit/requests';
import { Conversations, openTalksStore } from '../../features/talks';
import { Requests, createMakerRequests, createMakerSender, pickAsk, type ExpectedAsk } from '../../features/requests';
import { SettingsPanel } from '../../features/settings/settings-panel';
import { SharePanel } from '../../features/settings/share-panel';
import { AboutScreen } from '../../features/about';
import { useApp } from '../app-state';
import type { ViewId } from '../worlds';

/** The talks on the phone, searched and read; the connection is opened with the screen and closed with it. */
function ConversationsScreen({ onBack }: { onBack: () => void }) {
  const store = useMemo(() => openTalksStore(), []);
  useEffect(() => () => store.close(), [store]);
  return <Conversations store={store} onBack={onBack} />;
}

/** The requests to the maker, and the asks people are expected to make; a pick takes the grown-up to the tutor to say it. */
function RequestsScreen({ onBack }: { onBack: () => void }) {
  const { profiles, setView } = useApp();
  const requests = useMemo(() => createMakerRequests({ send: createMakerSender() }), []);
  const names = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.name])), [profiles]);
  const onAsk = (ask: ExpectedAsk) => {
    pickAsk({ ask, who: GROWN_UP });
    setView('door');
  };
  return <Requests requests={requests} names={names} onAsk={onAsk} onBack={onBack} />;
}

export function GrownUpsWorld({ view }: { view: ViewId | null }) {
  const app = useApp();
  const { activeProfile, setView, goBack } = app;

  switch (view) {
    case 'conversations':
      return <ConversationsScreen onBack={goBack} />;

    case 'requests':
      return <RequestsScreen onBack={goBack} />;

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
          onOpenRequests={() => setView('requests')}
          onOpenConversations={() => setView('conversations')}
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
