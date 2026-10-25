// mw-79en7t.49 (Kestrel 17a): every screen under src/worlds/grown-ups opens with one plain sentence a parent reads
// at a glance: under 100 characters, and the first paragraph on the screen.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { db } from '../../src/data/db';
import { setParentPin } from '../../src/features/tutor/parent-pin';
import { HowIsItGoing } from '../../src/worlds/grown-ups/HowIsItGoing';
import { GrownUps } from '../../src/worlds/grown-ups/GrownUps';
import { ParentScreen } from '../../src/worlds/grown-ups/parent-screen';
import { WhoIsLearning } from '../../src/worlds/grown-ups/WhoIsLearning';
import { paulProfile } from '../fixtures/profiles';

const DIR = join(__dirname, '../../src/worlds/grown-ups');

/** Files in the world that are not screens of their own: a part of a screen, or a helper. */
const NOT_SCREENS = new Set(['parent-sessions-view.tsx', 'first-line.tsx', 'Licence.tsx']);

const noop = () => undefined;

/** How each screen is drawn, and what to wait for before it is open. */
const SCREENS: Record<string, { draw: () => ReactElement; open?: () => Promise<void> }> = {
  'GrownUps.tsx': {
    draw: () => <GrownUps profileId={paulProfile.id} onExit={noop} />,
    open: async () => {
      for (const d of '1234') fireEvent.click(screen.getByRole('button', { name: d }));
      await screen.findByRole('heading', { name: 'Grown-ups' });
    },
  },
  'HowIsItGoing.tsx': { draw: () => <HowIsItGoing /> },
  'WhoIsLearning.tsx': {
    draw: () => (
      <WhoIsLearning
        learners={[paulProfile]}
        archived={[]}
        activeId={paulProfile.id}
        onSwitch={noop}
        onAdd={noop}
        onArchive={noop}
        onRestore={noop}
        onDelete={noop}
      />
    ),
  },
  'parent-screen.tsx': { draw: () => <ParentScreen profileId={paulProfile.id} onBack={noop} /> },
};

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
  await setParentPin('1234', 'What is the name of your first pet?', 'Rex');
});

describe('the first line of every Grown-ups screen', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !NOT_SCREENS.has(f));

  it('is tested for every screen in the folder (the test enumerates them)', () => {
    expect(files.sort()).toEqual(Object.keys(SCREENS).sort());
  });

  for (const [file, { draw, open }] of Object.entries(SCREENS)) {
    it(`${file} opens with one plain sentence under 100 characters`, async () => {
      render(draw());
      await open?.();
      const line = await screen.findByTestId('first-line');
      const text = (line.textContent ?? '').trim();
      expect(text.length).toBeGreaterThan(10);
      expect(text.length).toBeLessThan(100);
      expect(text).toMatch(/[.!?]$/);
      // it is the first paragraph on the screen, straight after the title
      expect(document.querySelector('p')).toBe(line);
    });
  }
});
