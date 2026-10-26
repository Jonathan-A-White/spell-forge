// src/features/settings/settings-registry.ts: every setting of the Settings screen declared once (defineSetting) over pwa-kit/settings, and the
// one list of rows the screen draws: the settings plus the links and actions beside them. A row that needs something this screen was not given
// (a way to change the grade goal, to export) says so with dependsOn, and is hidden while the screen has not got it.

import {
  createRegistry,
  createSettingsStore,
  defineSetting,
  entryOf,
  rowsInOrder,
  type SettingDef,
  type SettingsRow,
  type SettingsSection,
  type SettingsStorage,
  type Values,
} from 'pwa-kit/settings';
import { PRESETS } from '../../accessibility/presets';

export type SettingsSectionId =
  | 'appearance'
  | 'presets'
  | 'gradeGoal'
  | 'learningOrder'
  | 'photoImport'
  | 'share'
  | 'data'
  | 'deviceKey'
  | 'maker'
  | 'about'
  | 'developer';

export const SETTINGS_SECTIONS: readonly SettingsSection<SettingsSectionId>[] = [
  { id: 'appearance', title: 'Appearance' },
  { id: 'presets', title: 'Accessibility Presets' },
  { id: 'gradeGoal', title: 'Grade Goal', hint: 'Percentage of words that need to be familiar or mastered to be test-ready' },
  {
    id: 'learningOrder',
    title: 'Learning Order',
    hint: 'Order in which new words appear in learning mode. Practice, quiz, and games are always randomized.',
  },
  { id: 'photoImport', title: 'Photo Import Filters' },
  { id: 'share', title: 'Share' },
  { id: 'data', title: 'Data' },
  { id: 'deviceKey', title: "This device's key" },
  { id: 'maker', title: 'Ask the maker' },
  { id: 'about', title: 'About' },
  { id: 'developer', title: 'Developer' },
];

/** Sections whose control draws its own heading. */
export const SELF_TITLED: readonly SettingsSectionId[] = ['photoImport', 'deviceKey'];

/** What a screen may or may not be given a way to do; a row that needs one is hidden without it. */
export type Capability =
  | 'gradeGoal'
  | 'learningStrategy'
  | 'importFilter'
  | 'share'
  | 'export'
  | 'import'
  | 'requests'
  | 'conversations'
  | 'about'
  | 'debugMode'
  | 'ttsDebug';

const CAPABILITIES: readonly Capability[] = [
  'gradeGoal',
  'learningStrategy',
  'importFilter',
  'share',
  'export',
  'import',
  'requests',
  'conversations',
  'about',
  'debugMode',
  'ttsDebug',
];

const needs = (capability: Capability) => ({ key: `can.${capability}`, shown: (value: string) => value === 'yes' });

/** The values the rows' dependencies read: 'yes' for each capability the screen has, else 'no'. */
export function settingsValues(has: readonly Capability[]): Values {
  return Object.fromEntries(CAPABILITIES.map((c) => [`can.${c}`, has.includes(c) ? 'yes' : 'no']));
}

// ─── The choices (value, name, one line, icon) ──────────────────

export const CONTRAST_OPTIONS = [
  { value: 'light', label: 'Light', description: 'Warm, easy on the eyes', icon: 'sun' },
  { value: 'dark', label: 'Dark', description: 'Easier in low light', icon: 'moon' },
  { value: 'high-contrast', label: 'Enhanced', description: 'Maximum readability', icon: 'eye' },
] as const;

export const GRADE_GOAL_OPTIONS = [
  { value: '80', label: '80%', description: 'A solid foundation' },
  { value: '90', label: '90%', description: 'Well prepared' },
  { value: '100', label: '100%', description: 'Fully mastered' },
] as const;

export const LEARNING_STRATEGY_OPTIONS = [
  { value: 'wave', label: 'Wave', description: 'Easy → medium → hard → medium → easy. Ends on a confidence note.' },
  { value: 'easy-to-hard', label: 'Easy to Hard', description: 'Shortest words first, longest last' },
  { value: 'hard-to-easy', label: 'Hard to Easy', description: 'Longest words first, shortest last' },
  { value: 'random', label: 'Random', description: 'Fresh shuffle each time you start learning' },
] as const;

const ON_OFF = {
  kind: 'choice',
  values: [
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ],
} as const;

const choiceOf = (options: readonly { value: string; label: string }[]) => ({
  kind: 'choice' as const,
  values: options.map(({ value, label }) => ({ value, label })),
});

const setting = (spec: Parameters<typeof defineSetting<string, SettingsSectionId>>[0]) => defineSetting<string, SettingsSectionId>(spec);

// ─── The settings ───────────────────────────────────────────────

export const SETTINGS_DEFS: readonly SettingDef<string, SettingsSectionId>[] = [
  setting({
    key: 'contrastMode',
    default: 'light',
    allowed: choiceOf(CONTRAST_OPTIONS),
    section: 'appearance',
    label: 'Appearance',
    hint: 'Light, dark or enhanced contrast',
    help: CONTRAST_OPTIONS.map((o) => `${o.label}: ${o.description}`).join('. '),
  }),
  setting({
    key: 'accessibilityPreset',
    default: PRESETS[0].name,
    allowed: choiceOf(PRESETS.map((p) => ({ value: p.name, label: p.name }))),
    section: 'presets',
    label: 'Accessibility Presets',
    hint: 'Text size, spacing and motion in one tap',
    help: PRESETS.map((p) => `${p.name}: ${p.description}`).join('. '),
  }),
  setting({
    key: 'gradeGoal',
    default: '100',
    allowed: choiceOf(GRADE_GOAL_OPTIONS),
    section: 'gradeGoal',
    label: 'Grade Goal',
    hint: 'Percentage of words that need to be familiar or mastered to be test-ready',
    help: GRADE_GOAL_OPTIONS.map((o) => `${o.label}: ${o.description}`).join('. '),
    dependsOn: needs('gradeGoal'),
  }),
  setting({
    key: 'learningStrategy',
    default: 'wave',
    allowed: choiceOf(LEARNING_STRATEGY_OPTIONS),
    section: 'learningOrder',
    label: 'Learning Order',
    hint: 'Order in which new words appear in learning mode',
    help: LEARNING_STRATEGY_OPTIONS.map((o) => `${o.label}: ${o.description}`).join('. '),
    dependsOn: needs('learningStrategy'),
  }),
  setting({
    key: 'importFilterWords',
    default: '',
    // the phrases, one to a line; any text is a list of them
    allowed: { kind: 'text', valid: () => true, example: 'Name\nDate' },
    parse: (raw) => (typeof raw === 'string' ? raw : ''),
    section: 'photoImport',
    label: 'Photo Import Filters',
    hint: 'Words and phrases to leave out when importing a word list from a photo',
    dependsOn: needs('importFilter'),
  }),
  setting({
    key: 'debugMode',
    default: 'off',
    allowed: ON_OFF,
    section: 'developer',
    label: 'Debug Mode',
    hint: 'Show tap targets, click log, and element info',
    dependsOn: needs('debugMode'),
  }),
  setting({
    key: 'tutorPreview',
    default: 'off',
    allowed: ON_OFF,
    section: 'developer',
    label: 'Tutor (preview)',
    hint: 'Show the Tutor tile on Home',
  }),
  setting({
    key: 'ttsDebug',
    default: 'off',
    allowed: ON_OFF,
    section: 'developer',
    label: 'TTS Debug Log',
    hint: 'Show speech synthesis diagnostics on screen',
    dependsOn: needs('ttsDebug'),
  }),
];

export const SETTING_KEYS: readonly string[] = SETTINGS_DEFS.map((d) => d.key);

// ─── The rows that are not settings: links and actions, and the device key's own box ────────

const OTHER_ROWS: readonly SettingsRow<SettingsSectionId>[] = [
  { key: 'link.share', section: 'share', label: 'Share SpellForge', hint: 'Send the app link, show QR code', dependsOn: needs('share') },
  { key: 'action.export', section: 'data', label: 'Export Profile', hint: 'Download a backup of all your data', dependsOn: needs('export') },
  { key: 'action.import', section: 'data', label: 'Import Profile', hint: 'Restore from a backup file', dependsOn: needs('import') },
  { key: 'deviceKey', section: 'deviceKey', label: "This device's key", hint: 'Give this to whoever issues your licence' },
  { key: 'link.requests', section: 'maker', label: 'Requests to the maker', hint: 'Ask for something new, and see what was asked', dependsOn: needs('requests') },
  { key: 'link.conversations', section: 'maker', label: 'Conversations', hint: 'Every talk with the tutor, to search and read', dependsOn: needs('conversations') },
  { key: 'link.about', section: 'about', label: 'About & Credits', hint: 'Who and what SpellForge is built on', dependsOn: needs('about') },
];

/** Every row the screen can draw, section by section. */
export const SETTINGS_ROWS: readonly SettingsRow<SettingsSectionId>[] = rowsInOrder<SettingsSectionId, SettingsRow<SettingsSectionId>>(
  SETTINGS_SECTIONS,
  [...SETTINGS_DEFS, ...OTHER_ROWS],
);

/** The registry over the screen's own storage: it reads from the screen's props and writes by calling its handlers. */
export function createSettingsRegistry(storage: SettingsStorage) {
  const store = createSettingsStore(storage);
  return createRegistry(SETTINGS_DEFS.map((def) => entryOf(def, store)));
}
