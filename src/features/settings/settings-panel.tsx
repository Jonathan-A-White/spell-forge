// src/features/settings/settings-panel.tsx — Full settings screen with theme toggle and accessibility presets

import { useRef } from 'react';
import type { AccessibilitySettings, LearningStrategy } from '../../contracts/types';
import { PRESETS, type NamedPreset } from '../../accessibility/presets';
import { ImportFilterSettings } from './import-filter-settings';

type ContrastMode = AccessibilitySettings['contrastMode'];

interface SettingsPanelProps {
  profile: { name: string; themeId: string; gradeGoal?: number };
  settings: AccessibilitySettings;
  importFilterWords?: string[];
  onImportFilterWordsChange?: (phrases: string[]) => void;
  onContrastModeChange: (mode: ContrastMode) => void;
  onPresetApply: (preset: NamedPreset) => void;
  onGradeGoalChange?: (goal: number) => void;
  onLearningStrategyChange?: (strategy: LearningStrategy) => void;
  onExportProfile?: () => void;
  onImportProfile?: (file: File) => void;
  onShare?: () => void;
  onSendFeedback?: () => void;
  ttsDebugEnabled?: boolean;
  onToggleTtsDebug?: () => void;
  debugModeEnabled?: boolean;
  onToggleDebugMode?: () => void;
  onBack: () => void;
}

const learningStrategyOptions: { value: LearningStrategy; label: string; description: string }[] = [
  { value: 'wave', label: 'Wave', description: 'Easy → medium → hard → medium → easy. Ends on a confidence note.' },
  { value: 'easy-to-hard', label: 'Easy to Hard', description: 'Shortest words first, longest last' },
  { value: 'hard-to-easy', label: 'Hard to Easy', description: 'Longest words first, shortest last' },
  { value: 'random', label: 'Random', description: 'Fresh shuffle each time you start learning' },
];

const gradeGoalOptions: { value: number; label: string; description: string }[] = [
  { value: 80, label: '80%', description: 'A solid foundation' },
  { value: 90, label: '90%', description: 'Well prepared' },
  { value: 100, label: '100%', description: 'Fully mastered' },
];

const contrastModes: { value: ContrastMode; label: string; description: string; icon: string }[] = [
  { value: 'light', label: 'Light', description: 'Warm, easy on the eyes', icon: 'sun' },
  { value: 'dark', label: 'Dark', description: 'Easier in low light', icon: 'moon' },
  { value: 'high-contrast', label: 'Enhanced', description: 'Maximum readability', icon: 'eye' },
];

export function SettingsPanel({
  profile,
  settings,
  importFilterWords,
  onImportFilterWordsChange,
  onContrastModeChange,
  onPresetApply,
  onGradeGoalChange,
  onLearningStrategyChange,
  onExportProfile,
  onImportProfile,
  onShare,
  onSendFeedback,
  ttsDebugEnabled,
  onToggleTtsDebug,
  debugModeEnabled,
  onToggleDebugMode,
  onBack,
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
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

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Appearance section */}
        <section>
          <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
            Appearance
          </h2>
          <div className="space-y-2">
            {contrastModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => onContrastModeChange(mode.value)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                  settings.contrastMode === mode.value
                    ? 'border-sf-primary bg-sf-surface shadow-md'
                    : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                }`}
                aria-pressed={settings.contrastMode === mode.value}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  settings.contrastMode === mode.value
                    ? 'bg-sf-primary text-sf-primary-text'
                    : 'bg-sf-track text-sf-muted'
                }`}>
                  <ModeIcon icon={mode.icon} />
                </div>
                <div className="text-left flex-1">
                  <p className={`font-bold text-sm ${
                    settings.contrastMode === mode.value ? 'text-sf-heading' : 'text-sf-text'
                  }`}>
                    {mode.label}
                  </p>
                  <p className="text-xs text-sf-muted">{mode.description}</p>
                </div>
                {settings.contrastMode === mode.value && (
                  <div className="text-sf-primary">
                    <CheckIcon />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Accessibility presets section */}
        <section>
          <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
            Accessibility Presets
          </h2>
          <div className="space-y-2">
            {PRESETS.map((preset) => {
              const isActive = isPresetActive(preset, settings);
              return (
                <button
                  key={preset.name}
                  onClick={() => onPresetApply(preset)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    isActive
                      ? 'border-sf-primary bg-sf-surface shadow-md'
                      : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                    isActive ? 'bg-sf-primary text-sf-primary-text' : 'bg-sf-track'
                  }`}>
                    {getPresetEmoji(preset.name)}
                  </div>
                  <div className="text-left flex-1">
                    <p className={`font-bold text-sm ${isActive ? 'text-sf-heading' : 'text-sf-text'}`}>
                      {preset.name}
                    </p>
                    <p className="text-xs text-sf-muted">{preset.description}</p>
                  </div>
                  {isActive && (
                    <div className="text-sf-primary">
                      <CheckIcon />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Grade Goal */}
        {onGradeGoalChange && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-1">
              Grade Goal
            </h2>
            <p className="text-xs text-sf-muted mb-3">
              Percentage of words that need to be familiar or mastered to be test-ready
            </p>
            <div className="space-y-2">
              {gradeGoalOptions.map((option) => {
                const isSelected = (profile.gradeGoal ?? 100) === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => onGradeGoalChange(option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-sf-primary bg-sf-surface shadow-md'
                        : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                      isSelected
                        ? 'bg-sf-primary text-sf-primary-text'
                        : 'bg-sf-track text-sf-muted'
                    }`}>
                      {option.label}
                    </div>
                    <div className="text-left flex-1">
                      <p className={`font-bold text-sm ${
                        isSelected ? 'text-sf-heading' : 'text-sf-text'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-sf-muted">{option.description}</p>
                    </div>
                    {isSelected && (
                      <div className="text-sf-primary">
                        <CheckIcon />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Learning Order */}
        {onLearningStrategyChange && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-1">
              Learning Order
            </h2>
            <p className="text-xs text-sf-muted mb-3">
              Order in which new words appear in learning mode. Practice, quiz, and games are always randomized.
            </p>
            <div className="space-y-2">
              {learningStrategyOptions.map((option) => {
                const isSelected = settings.learningStrategy === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => onLearningStrategyChange(option.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-sf-primary bg-sf-surface shadow-md'
                        : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? 'bg-sf-primary text-sf-primary-text'
                        : 'bg-sf-track text-sf-muted'
                    }`}>
                      <LearningStrategyIcon strategy={option.value} />
                    </div>
                    <div className="text-left flex-1">
                      <p className={`font-bold text-sm ${
                        isSelected ? 'text-sf-heading' : 'text-sf-text'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-sf-muted">{option.description}</p>
                    </div>
                    {isSelected && (
                      <div className="text-sf-primary">
                        <CheckIcon />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Photo import filters */}
        {onImportFilterWordsChange && (
          <ImportFilterSettings
            filterPhrases={importFilterWords ?? []}
            onUpdate={onImportFilterWordsChange}
          />
        )}

        {/* Share */}
        {onShare && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Share
            </h2>
            <button
              onClick={onShare}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
                <ShareSettingsIcon />
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-sm text-sf-text">Share SpellForge</p>
                <p className="text-xs text-sf-muted">Send the app link, show QR code</p>
              </div>
            </button>
          </section>
        )}

        {/* Data management */}
        {(onExportProfile || onImportProfile) && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Data
            </h2>
            <div className="space-y-2">
              {onExportProfile && (
                <button
                  onClick={onExportProfile}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
                    <ExportIcon />
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-bold text-sm text-sf-text">Export Profile</p>
                    <p className="text-xs text-sf-muted">Download a backup of all your data</p>
                  </div>
                </button>
              )}
              {onImportProfile && (
                <>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
                      <ImportIcon />
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-sm text-sf-text">Import Profile</p>
                      <p className="text-xs text-sf-muted">Restore from a backup file</p>
                    </div>
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportProfile(file);
                      if (importInputRef.current) importInputRef.current.value = '';
                    }}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </section>
        )}

        {/* Send Feedback */}
        {onSendFeedback && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Feedback
            </h2>
            <button
              onClick={onSendFeedback}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
                <FeedbackIcon />
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-sm text-sf-text">Send Feedback</p>
                <p className="text-xs text-sf-muted">Let us know how we can improve</p>
              </div>
            </button>
          </section>
        )}

        {/* Developer Settings */}
        {(onToggleTtsDebug || onToggleDebugMode) && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Developer
            </h2>
            <div className="space-y-2">
              {onToggleDebugMode && (
                <button
                  onClick={onToggleDebugMode}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    debugModeEnabled
                      ? 'border-sf-primary bg-sf-surface shadow-md'
                      : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                  }`}
                  aria-pressed={debugModeEnabled}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                    debugModeEnabled
                      ? 'bg-sf-primary text-sf-primary-text'
                      : 'bg-sf-track text-sf-muted'
                  }`}>
                    <BugIcon />
                  </div>
                  <div className="text-left flex-1">
                    <p className={`font-bold text-sm ${
                      debugModeEnabled ? 'text-sf-heading' : 'text-sf-text'
                    }`}>
                      Debug Mode
                    </p>
                    <p className="text-xs text-sf-muted">Show tap targets, click log, and element info</p>
                  </div>
                  {debugModeEnabled && (
                    <div className="text-sf-primary">
                      <CheckIcon />
                    </div>
                  )}
                </button>
              )}
              {onToggleTtsDebug && (
                <button
                  onClick={onToggleTtsDebug}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    ttsDebugEnabled
                      ? 'border-sf-primary bg-sf-surface shadow-md'
                      : 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover'
                  }`}
                  aria-pressed={ttsDebugEnabled}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                    ttsDebugEnabled
                      ? 'bg-sf-primary text-sf-primary-text'
                      : 'bg-sf-track text-sf-muted'
                  }`}>
                    <TerminalIcon />
                  </div>
                  <div className="text-left flex-1">
                    <p className={`font-bold text-sm ${
                      ttsDebugEnabled ? 'text-sf-heading' : 'text-sf-text'
                    }`}>
                      TTS Debug Log
                    </p>
                    <p className="text-xs text-sf-muted">Show speech synthesis diagnostics on screen</p>
                  </div>
                  {ttsDebugEnabled && (
                    <div className="text-sf-primary">
                      <CheckIcon />
                    </div>
                  )}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function isPresetActive(preset: NamedPreset, current: AccessibilitySettings): boolean {
  const p = preset.settings;
  return (
    p.fontSize === current.fontSize &&
    p.fontWeight === current.fontWeight &&
    p.letterSpacing === current.letterSpacing &&
    p.lineHeight === current.lineHeight &&
    p.tapTargetSize === current.tapTargetSize &&
    p.reducedMotion === current.reducedMotion
  );
}

function getPresetEmoji(name: string): string {
  switch (name.toLowerCase()) {
    case 'default': return 'Aa';
    case 'high visibility': return 'Aa';
    case 'dyslexia friendly': return 'Dy';
    case 'minimal': return 'Mi';
    default: return 'Aa';
  }
}

// ─── SVG Icons ───────────────────────────────────────────────

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ModeIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'sun':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'eye':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

function FeedbackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M6 10H2" />
      <path d="M22 10h-4" />
      <path d="M6 14H2" />
      <path d="M22 14h-4" />
      <path d="M8 6l-2-2" />
      <path d="M16 6l2-2" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function LearningStrategyIcon({ strategy }: { strategy: LearningStrategy }) {
  switch (strategy) {
    case 'wave':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M2 16 Q6 16 8 12 Q10 4 12 4 Q14 4 16 12 Q18 16 22 16" />
        </svg>
      );
    case 'easy-to-hard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <line x1="3" y1="20" x2="21" y2="4" />
        </svg>
      );
    case 'hard-to-easy':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <line x1="3" y1="4" x2="21" y2="20" />
        </svg>
      );
    case 'random':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      );
  }
}

function ShareSettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
