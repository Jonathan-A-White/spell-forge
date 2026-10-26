// src/worlds/grown-ups/Settings.tsx: the settings home of the Grown-ups world: a search box over the one list of rows
// (src/features/settings/settings-registry.ts, on pwa-kit/settings), then each section with the rows that apply. A setting is read from
// the screen's props and saved by calling the screen's handlers, through the registry; nothing here has a value of its own.

import { useRef, useState, type ReactNode } from 'react';
import { SettingsSearch, visibleRows, type SettingsStorage } from 'pwa-kit/settings';
import type { AccessibilitySettings, LearningStrategy } from '../../contracts/types';
import { PRESETS, getPreset, type NamedPreset } from '../../accessibility/presets';
import { ImportFilterSettings } from '../../features/settings/import-filter-settings';
import {
  CONTRAST_OPTIONS,
  GRADE_GOAL_OPTIONS,
  LEARNING_STRATEGY_OPTIONS,
  SELF_TITLED,
  SETTINGS_ROWS,
  SETTINGS_SECTIONS,
  createSettingsRegistry,
  settingsValues,
  type Capability,
} from '../../features/settings/settings-registry';
import {
  BugIcon,
  CheckIcon,
  ExportIcon,
  TalkIcon,
  ImportIcon,
  InfoIcon,
  LearningStrategyIcon,
  ModeIcon,
  ShareSettingsIcon,
  TerminalIcon,
} from '../../features/settings/settings-icons';
import { APP_VERSION } from '../../version';
import { FirstLine } from './first-line';
import { DeviceKeySection } from '../../features/device-key';
import { useTutorFlagSwitch } from '../../debug/debug-state';

export interface SettingsProps {
  profile: { name: string; themeId: string; gradeGoal?: number };
  settings: AccessibilitySettings;
  importFilterWords?: string[];
  onImportFilterWordsChange?: (phrases: string[]) => void;
  onContrastModeChange: (mode: AccessibilitySettings['contrastMode']) => void;
  onPresetApply: (preset: NamedPreset) => void;
  onGradeGoalChange?: (goal: number) => void;
  onLearningStrategyChange?: (strategy: LearningStrategy) => void;
  onExportProfile?: () => void;
  onImportProfile?: (file: File) => void;
  onShare?: () => void;
  onOpenRequests?: () => void;
  onOpenConversations?: () => void;
  ttsDebugEnabled?: boolean;
  onToggleTtsDebug?: () => void;
  debugModeEnabled?: boolean;
  onToggleDebugMode?: () => void;
  onOpenAbout?: () => void;
}

const BORDER = 'border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover';

function RowButton(props: {
  title: string;
  description: string;
  lead: ReactNode;
  leadClass?: string;
  selected?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  const { title, description, lead, leadClass = '', selected = false, pressed, onClick } = props;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 sf-card border-2 transition-all active:scale-[0.98] ${
        selected ? 'border-sf-primary bg-sf-surface shadow-md' : BORDER
      }`}
      aria-pressed={pressed}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${leadClass} ${selected ? 'bg-sf-primary text-sf-primary-text' : 'bg-sf-track text-sf-muted'}`}>
        {lead}
      </div>
      <div className="text-left flex-1">
        <p className={`font-bold text-sm ${selected ? 'text-sf-heading' : 'text-sf-text'}`}>{title}</p>
        <p className="text-xs text-sf-muted">{description}</p>
      </div>
      {selected && (
        <div className="text-sf-primary">
          <CheckIcon />
        </div>
      )}
    </button>
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

const presetEmoji = (name: string): string => (name.toLowerCase() === 'dyslexia friendly' ? 'Dy' : name.toLowerCase() === 'minimal' ? 'Mi' : 'Aa');

export function Settings(props: SettingsProps) {
  const { profile, settings, importFilterWords, onImportProfile } = props;
  const [query, setQuery] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [tutorOn, toggleTutor] = useTutorFlagSwitch();

  const has: Capability[] = [];
  const offers: [Capability, unknown][] = [
    ['gradeGoal', props.onGradeGoalChange],
    ['learningStrategy', props.onLearningStrategyChange],
    ['importFilter', props.onImportFilterWordsChange],
    ['share', props.onShare],
    ['export', props.onExportProfile],
    ['import', onImportProfile],
    ['requests', props.onOpenRequests],
    ['conversations', props.onOpenConversations],
    ['about', props.onOpenAbout],
    ['debugMode', props.onToggleDebugMode],
    ['ttsDebug', props.onToggleTtsDebug],
  ];
  for (const [capability, handler] of offers) if (handler) has.push(capability);

  const onOff = (on: boolean | undefined) => (on ? 'on' : 'off');
  const toggled = (on: boolean | undefined, value: string, toggle?: () => void) => {
    if ((value === 'on') !== !!on) toggle?.();
  };
  // Where each setting is kept: the screen's props. A write calls the handler the screen was given.
  const storage: SettingsStorage = {
    read(key) {
      switch (key) {
        case 'contrastMode': return settings.contrastMode;
        case 'accessibilityPreset': return PRESETS.find((p) => isPresetActive(p, settings))?.name;
        case 'gradeGoal': return String(profile.gradeGoal ?? 100);
        case 'learningStrategy': return settings.learningStrategy;
        case 'importFilterWords': return (importFilterWords ?? []).join('\n');
        case 'debugMode': return onOff(props.debugModeEnabled);
        case 'ttsDebug': return onOff(props.ttsDebugEnabled);
        case 'tutorPreview': return onOff(tutorOn);
        default: return undefined;
      }
    },
    write(key, value) {
      switch (key) {
        case 'contrastMode': return props.onContrastModeChange(value as AccessibilitySettings['contrastMode']);
        case 'accessibilityPreset': {
          const preset = getPreset(value);
          return preset ? props.onPresetApply(preset) : undefined;
        }
        case 'gradeGoal': return props.onGradeGoalChange?.(Number(value));
        case 'learningStrategy': return props.onLearningStrategyChange?.(value as LearningStrategy);
        case 'importFilterWords': return props.onImportFilterWordsChange?.(value.split('\n').filter((p) => p !== ''));
        case 'debugMode': return toggled(props.debugModeEnabled, value, props.onToggleDebugMode);
        case 'ttsDebug': return toggled(props.ttsDebugEnabled, value, props.onToggleTtsDebug);
        case 'tutorPreview': return toggled(tutorOn, value, toggleTutor);
        default: return undefined;
      }
    },
  };
  const registry = createSettingsRegistry(storage);
  const save = (key: string, value: string) => void registry.write(key, value).catch(() => undefined);
  const now = (key: string) => storage.read(key) ?? '';

  const rows = visibleRows(SETTINGS_ROWS, settingsValues(has), query);
  const shown = new Set(rows.map((r) => r.key));
  const rowIn = (key: string) => shown.has(key);

  const control = (key: string): ReactNode => {
    switch (key) {
      case 'contrastMode':
        return CONTRAST_OPTIONS.map((o) => (
          <RowButton key={o.value} title={o.label} description={o.description} lead={<ModeIcon icon={o.icon} />} selected={now(key) === o.value} pressed={now(key) === o.value} onClick={() => save(key, o.value)} />
        ));
      case 'accessibilityPreset':
        return PRESETS.map((p) => (
          <RowButton key={p.name} title={p.name} description={p.description} lead={presetEmoji(p.name)} leadClass="text-lg" selected={isPresetActive(p, settings)} onClick={() => save(key, p.name)} />
        ));
      case 'gradeGoal':
        return GRADE_GOAL_OPTIONS.map((o) => (
          <RowButton key={o.value} title={o.label} description={o.description} lead={o.label} leadClass="font-bold text-sm" selected={now(key) === o.value} pressed={now(key) === o.value} onClick={() => save(key, o.value)} />
        ));
      case 'learningStrategy':
        return LEARNING_STRATEGY_OPTIONS.map((o) => (
          <RowButton key={o.value} title={o.label} description={o.description} lead={<LearningStrategyIcon strategy={o.value} />} selected={now(key) === o.value} pressed={now(key) === o.value} onClick={() => save(key, o.value)} />
        ));
      case 'importFilterWords':
        return <ImportFilterSettings filterPhrases={importFilterWords ?? []} onUpdate={(phrases) => save(key, phrases.join('\n'))} />;
      case 'link.share':
        return <RowButton title="Share SpellForge" description="Send the app link, show QR code" lead={<ShareSettingsIcon />} onClick={() => props.onShare?.()} />;
      case 'action.export':
        return <RowButton title="Export Profile" description="Download a backup of all your data" lead={<ExportIcon />} onClick={() => props.onExportProfile?.()} />;
      case 'action.import':
        return (
          <>
            <RowButton title="Import Profile" description="Restore from a backup file" lead={<ImportIcon />} onClick={() => importInputRef.current?.click()} />
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportProfile?.(file);
                if (importInputRef.current) importInputRef.current.value = '';
              }}
              className="hidden"
            />
          </>
        );
      case 'deviceKey':
        return <DeviceKeySection />;
      case 'link.requests':
        return <RowButton title="Requests to the maker" description="Ask for something new, and see what was asked" lead={<TalkIcon />} onClick={() => props.onOpenRequests?.()} />;
      case 'link.conversations':
        return <RowButton title="Conversations" description="Every talk with the tutor, to search and read" lead={<TalkIcon />} onClick={() => props.onOpenConversations?.()} />;
      case 'link.about':
        return <RowButton title="About & Credits" description="Who and what SpellForge is built on" lead={<InfoIcon />} onClick={() => props.onOpenAbout?.()} />;
      case 'debugMode':
        return <RowButton title="Debug Mode" description="Show tap targets, click log, and element info" lead={<BugIcon />} leadClass="font-mono text-xs font-bold" selected={now(key) === 'on'} pressed={now(key) === 'on'} onClick={() => save(key, now(key) === 'on' ? 'off' : 'on')} />;
      case 'tutorPreview':
        return <RowButton title="Tutor (preview)" description="Show the Tutor tile on Home" lead={<TerminalIcon />} leadClass="font-mono text-xs font-bold" selected={now(key) === 'on'} pressed={now(key) === 'on'} onClick={() => save(key, now(key) === 'on' ? 'off' : 'on')} />;
      case 'ttsDebug':
        return <RowButton title="TTS Debug Log" description="Show speech synthesis diagnostics on screen" lead={<TerminalIcon />} leadClass="font-mono text-xs font-bold" selected={now(key) === 'on'} pressed={now(key) === 'on'} onClick={() => save(key, now(key) === 'on' ? 'off' : 'on')} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6 space-y-6">
      <FirstLine>Change how the app looks and works, or search for any setting.</FirstLine>
      <SettingsSearch query={query} onChange={setQuery} />
      {rows.length === 0 && (
        <p role="status" className="text-sm text-sf-muted">
          Nothing in Settings matches “{query.trim()}”.
        </p>
      )}
      {SETTINGS_SECTIONS.map((section) => {
        const inSection = SETTINGS_ROWS.filter((r) => r.section === section.id && rowIn(r.key));
        if (inSection.length === 0) return null;
        // a control that draws its own section and heading (the import filters, the device key) stands alone
        if (SELF_TITLED.includes(section.id)) return <div key={section.id}>{control(inSection[0].key)}</div>;
        return (
          <section key={section.id}>
            <h2 className={`text-sm font-bold text-sf-muted uppercase tracking-wider ${section.hint ? 'mb-1' : 'mb-3'}`}>{section.title}</h2>
            {section.hint && <p className="text-xs text-sf-muted mb-3">{section.hint}</p>}
            <div className="space-y-2">{inSection.map((r) => <div key={r.key} className="space-y-2">{control(r.key)}</div>)}</div>
          </section>
        );
      })}
      <p className="w-full text-center text-xs text-sf-muted pt-2 select-none">{`SpellForge v${APP_VERSION}`}</p>
    </div>
  );
}
