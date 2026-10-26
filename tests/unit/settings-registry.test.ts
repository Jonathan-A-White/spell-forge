// mw-79en7t.52: the Settings screen's settings are defineSetting rows through pwa-kit/settings' registry, searched, hiding what does not apply.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupProblems, neededFor, searchSettings, visibleRows } from 'pwa-kit/settings';
import { PRESETS } from '../../src/accessibility/presets';
import {
  SETTING_KEYS,
  SETTINGS_DEFS,
  SETTINGS_ROWS,
  SETTINGS_SECTIONS,
  createSettingsRegistry,
  settingsValues,
  type Capability,
} from '../../src/features/settings/settings-registry';

// The settings of the old settings-panel.tsx, by the key each is saved under (AccessibilitySettings and Profile fields, the debug and Tutor switches).
const OLD_PANEL_SETTINGS = [
  'contrastMode',
  'accessibilityPreset',
  'gradeGoal',
  'learningStrategy',
  'importFilterWords',
  'debugMode',
  'ttsDebug',
  'tutorPreview',
];

const ALL: Capability[] = ['gradeGoal', 'learningStrategy', 'importFilter', 'share', 'export', 'import', 'requests', 'conversations', 'about', 'debugMode', 'ttsDebug'];
const keysOf = (rows: readonly { key: string }[]) => rows.map((r) => r.key);

describe('every setting of the old panel is a defineSetting row', () => {
  it('lists the keys, each declared once with its key, label and hint', () => {
    expect([...SETTING_KEYS].sort()).toEqual([...OLD_PANEL_SETTINGS].sort());
    for (const key of OLD_PANEL_SETTINGS) {
      const def = SETTINGS_DEFS.find((d) => d.key === key);
      expect(def, key).toBeDefined();
      expect(def!.label.length).toBeGreaterThan(0);
      expect(def!.hint.length).toBeGreaterThan(0);
      expect(typeof def!.parse).toBe('function');
    }
  });

  it('each is a row of the one list, and the list is in the order of the sections', () => {
    const rows = keysOf(SETTINGS_ROWS);
    for (const key of OLD_PANEL_SETTINGS) expect(rows).toContain(key);
    expect(new Set(rows).size).toBe(rows.length);
    const order = SETTINGS_SECTIONS.map((s) => s.id);
    const at = SETTINGS_ROWS.map((r) => order.indexOf(r.section));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('keeps the values each setting allowed before', () => {
    const allowed = (key: string) => {
      const a = SETTINGS_DEFS.find((d) => d.key === key)!.allowed;
      return a.kind === 'choice' ? a.values.map((v) => v.value) : [];
    };
    expect(allowed('contrastMode')).toEqual(['light', 'dark', 'high-contrast']);
    expect(allowed('gradeGoal')).toEqual(['80', '90', '100']);
    expect(allowed('learningStrategy')).toEqual(['wave', 'easy-to-hard', 'hard-to-easy', 'random']);
    expect(allowed('accessibilityPreset')).toEqual(PRESETS.map((p) => p.name));
  });

  it('is in the sections the panel had, each section in a group of one page', () => {
    expect(groupProblems(SETTINGS_SECTIONS, [{ id: 'all', title: 'Settings', hint: 'Every setting.', sections: SETTINGS_SECTIONS.map((s) => s.id) }])).toEqual([]);
  });
});

describe('a row with dependsOn hides when it does not apply', () => {
  it('hides the Grade Goal row when the screen has no way to change the grade goal, and shows it when it has', () => {
    expect(SETTINGS_ROWS.find((r) => r.key === 'gradeGoal')!.dependsOn).toBeDefined();
    expect(keysOf(visibleRows(SETTINGS_ROWS, settingsValues([]), ''))).not.toContain('gradeGoal');
    expect(keysOf(visibleRows(SETTINGS_ROWS, settingsValues(['gradeGoal']), ''))).toContain('gradeGoal');
  });

  it('the rows every screen has are always drawn', () => {
    const drawn = keysOf(visibleRows(SETTINGS_ROWS, settingsValues([]), ''));
    for (const key of ['contrastMode', 'accessibilityPreset', 'tutorPreview', 'deviceKey']) expect(drawn).toContain(key);
  });

  it('draws every row when every capability is given', () => {
    expect(keysOf(visibleRows(SETTINGS_ROWS, settingsValues(ALL), ''))).toEqual(keysOf(SETTINGS_ROWS));
  });

  it('names what to turn on for a hidden row', () => {
    expect(neededFor(SETTINGS_ROWS, settingsValues([]), 'gradeGoal')).toBeUndefined();
  });
});

describe('search finds a row by its label', () => {
  const values = settingsValues(ALL);
  it.each([
    ['Grade Goal', 'gradeGoal'],
    ['learning order', 'learningStrategy'],
    ['TUTOR', 'tutorPreview'],
    ['tts', 'ttsDebug'],
    ['appearance', 'contrastMode'],
    ['Accessibility Presets', 'accessibilityPreset'],
  ])('%s finds %s', (query, key) => {
    expect(keysOf(searchSettings(SETTINGS_ROWS, query))).toContain(key);
    expect(keysOf(visibleRows(SETTINGS_ROWS, values, query))).toContain(key);
  });

  it('a row that does not apply is not drawn by the search either', () => {
    expect(keysOf(visibleRows(SETTINGS_ROWS, settingsValues([]), 'grade goal'))).not.toContain('gradeGoal');
  });

  it('finds nothing for words no row holds', () => {
    expect(visibleRows(SETTINGS_ROWS, values, 'zzzqqq')).toEqual([]);
  });
});

describe('the registry reads and saves through the screen’s own handlers', () => {
  it('a write reaches the storage as text and is read back', async () => {
    const saved: Record<string, string> = { gradeGoal: '100' };
    const registry = createSettingsRegistry({ read: (k) => saved[k], write: (k, v) => void (saved[k] = v) });
    await registry.write('gradeGoal', '90');
    expect(saved.gradeGoal).toBe('90');
    expect((await registry.currentSettings()).gradeGoal).toBe('90');
  });

  it('refuses a value the setting does not allow', async () => {
    const saved: Record<string, string> = {};
    const registry = createSettingsRegistry({ read: (k) => saved[k], write: (k, v) => void (saved[k] = v) });
    const result = await registry.applyChanges([{ key: 'contrastMode', value: 'neon' }]);
    expect(result.applied).toEqual([]);
    expect(result.refused).toHaveLength(1);
  });
});

describe('the panel is a thin wrapper, on the kit at its pinned commit', () => {
  it('settings-panel.tsx is under 100 lines', () => {
    const lines = readFileSync('src/features/settings/settings-panel.tsx', 'utf8').split('\n').length;
    expect(lines).toBeLessThan(100);
  });

  it('pwa-kit is pinned at the commit that holds pwa-kit/settings and pwa-kit/requests (0.10.0)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['pwa-kit']).toBe('github:Jonathan-A-White/pwa-kit#011083d67ed4eea69f08177ffa2b04a3b57eb51d');
  });
});
