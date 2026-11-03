// mw-79en7t.83: Kestrel says "math", never "maths", and spells the American way in all it shows and speaks. The ids that name
// the Math world inside the app (the view 'maths-home', the world id 'maths', the storage keys, the schema values) stay, so a
// child's stored progress still opens; what a child or parent sees, and what the tutor is told to say, is American.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { HomeScreen } from '../../src/features/dashboard/home-screen';
import { HowIsItGoing } from '../../src/worlds/grown-ups/HowIsItGoing';
import { WORLDS } from '../../src/shell/worlds';
import { MATHS_SCREEN_NAME, storageGraphStore, storageKeep } from '../../src/worlds/maths';
import { MATHS_GOALS } from '../../src/learn/maths';
import { NO_LICENCE_LINE } from '../../src/shell/licence-gate';
import type { Profile } from '../../src/contracts';

const ROOT = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const profile = { id: 'p1', name: 'Sam', createdAt: 0, language: 'en' } as unknown as Profile;

describe('what a child or parent sees says Math', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  });

  it("Home's tile reads Math, and no text on Home says maths", () => {
    const { container } = render(
      <HomeScreen
        profile={profile}
        wordLists={[]}
        allWords={[]}
        allStats={[]}
        streakData={null}
        coinBalance={null}
        learningProgress={[]}
        onNavigate={vi.fn()}
        onSwitchProfile={vi.fn()}
        hasMultipleProfiles={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^Math\b/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/maths/i);
  });

  it('How is it going names the world Math, in its title and its one line', () => {
    const { container } = render(<HowIsItGoing />);
    expect(screen.getByRole('region', { name: 'Math' })).toBeInTheDocument();
    expect(container.textContent).toContain('Nothing to show for math yet.');
    expect(container.textContent).not.toMatch(/maths/i);
  });

  it("the world's title, the screen name told to the tutor and the goals' titles say math", () => {
    expect(WORLDS.find((world) => world.id === 'maths')?.title).toBe('Math');
    expect(MATHS_SCREEN_NAME).toBe('Math');
    for (const goal of MATHS_GOALS) expect(goal.title).not.toMatch(/maths/i);
  });

  it('the licence line is American', () => {
    expect(NO_LICENCE_LINE).not.toMatch(/licence/i);
  });
});

describe('the tutor is told to say math', () => {
  /** The instructions with their code spans taken out: `maths` there is the schema value (world, progress), never the tutor's word; the one "maths" in quotes is the line that forbids it. */
  const words = (file: string): string => read(file).replace(/`[^`]*`/g, '').replace(/"maths"/g, '');

  for (const file of ['grinds/tutor-talk.instructions.md', 'grinds/mnemonic-picture.instructions.md']) {
    it(`${file} never spells the subject maths outside a code span`, () => {
      expect(words(file)).not.toMatch(/\bmaths\b/i);
    });
  }

  it('tutor-talk tells the tutor to say math in `words`, while the world value stays `maths`', () => {
    const text = read('grinds/tutor-talk.instructions.md');
    expect(text).toMatch(/say "math"/i);
    expect(text).toContain('`maths`');
  });

  it('what the examples and the eval cases show a child says math', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.json')) files.push(path);
      }
    };
    walk('grinds/examples/tutor-talk');
    walk('grinds/tutor-talk.eval');
    const said = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(said) : value && typeof value === 'object' ? Object.values(value).flatMap(said) : [];
    for (const file of files) {
      const json = JSON.parse(read(file)) as Record<string, unknown>;
      // keys are schema names ('maths' as a progress key, an id such as 'sat-maths-800') and stay; only the sentences are checked
      const sentences = said(json).filter((text) => /\s/.test(text));
      for (const sentence of sentences) expect(sentence, file).not.toMatch(/\bmaths\b/i);
    }
  });
});

describe('a progress kept before this change still opens', () => {
  it('reads the graph and the keep from the old keys', async () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    } as unknown as Storage;
    // exactly as the app wrote them before: the keys are literal here on purpose, so renaming them fails this test
    fake.setItem('sf-maths-graph:kid', JSON.stringify([['count-to-10', { state: 'solid' }]]));
    fake.setItem('sf-maths-keep:kid', JSON.stringify({ placement: null, tries: { 'count-to-10': [true, true] } }));

    const entries = await storageGraphStore('kid', fake).entries();
    expect([...entries.keys()]).toEqual(['count-to-10']);
    expect((await storageKeep('kid', fake).load()).tries).toEqual({ 'count-to-10': [true, true] });
  });
});

describe('the shown text is American', () => {
  const SHOWN = [
    'src/worlds/grown-ups/Licence.tsx',
    'src/features/about/about-screen.tsx',
    'src/features/device-key/device-key-section.tsx',
    'src/features/settings/settings-registry.ts',
    'src/features/tutor/tutor-flow.ts',
    'src/features/tutor/form-commands.ts',
    'src/features/requests/expected-asks.ts',
    'src/shell/share-app.ts',
    'src/shell/licence-gate.ts',
    'src/shell/WorldSwitch.tsx',
    'src/worlds/spelling/SpellingWorld.tsx',
    'src/worlds/spelling/spelling-report.ts',
    'src/features/about/credits.ts',
    'public/changelog.json',
    'public/manifest.json',
    ...readdirSync(join(ROOT, 'src/learn/maths'))
      .filter((name) => name.startsWith('nodes-'))
      .map((name) => `src/learn/maths/${name}`),
  ];
  /** String literals and JSX text only (identifiers such as licenceState stay), taken from lines that are not comments. */
  const shown = (file: string): string =>
    read(file)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*|import |export .* from )/.test(line))
      .flatMap((line) => line.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1|>[^<>{}]+</g) ?? [])
      // an import path, an id or a class list has no space and is not read by anyone
      .filter((text) => /\s/.test(text.slice(1, -1)) || !/[-/:._]|Error'$/.test(text))
      .join('\n')
      // a name inside ${...} is code, not text
      .replace(/\$\{[^}]*\}/g, '');
  for (const file of SHOWN) {
    it(`${file} shows no British spelling`, () => {
      expect(shown(file)).not.toMatch(/licence|colour|practis|favourite|\bspelt\b|\bmaths\b|centre|neighbour|kilometre|flavour/i);
    });
  }
});
