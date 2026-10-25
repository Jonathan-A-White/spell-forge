// src/features/settings/settings-panel.tsx — the Settings screen: its header and back button around the Grown-ups settings home
// (src/worlds/grown-ups/Settings.tsx), whose rows are declared in settings-registry.ts over pwa-kit/settings.

import { Settings, type SettingsProps } from '../../worlds/grown-ups/Settings';
import { BackArrowIcon } from './settings-icons';

export type SettingsPanelProps = SettingsProps & { onBack: () => void };

export function SettingsPanel({ onBack, ...settings }: SettingsPanelProps) {
  return (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Go back"
          >
            <BackArrowIcon />
          </button>
          <h1 className="text-xl font-bold text-sf-heading">Settings</h1>
        </div>
      </div>
      <Settings {...settings} />
    </div>
  );
}
