// mw-79en7t.49 (Kestrel 17a): Who is learning, the learners and their @learn-kit/learner profiles; it replaces the
// old profile picker.
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emptyProfile, learn } from 'learn-kit/learner';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { WhoIsLearning } from '../../src/worlds/grown-ups/WhoIsLearning';
import { describeLearner } from '../../src/worlds/grown-ups/describe-learner';
import type { Profile } from '../../src/contracts';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { emmaProfile, paulProfile } from '../fixtures/profiles';

const told = (profile = emptyProfile()) => {
  const a = learn(profile, { field: 'age', value: 7, turn: 't1', when: 1 }).profile;
  const b = learn(a, { field: 'learnerKind', value: 'learns by doing', turn: 't2', when: 2 }).profile;
  return learn(b, { field: 'speed', value: 'steady', turn: 't3', when: 3 }).profile;
};

const paul: Profile = { ...paulProfile, learner: told() };
const emma: Profile = { ...emmaProfile };

function Harness({ onAdd = () => undefined }: { onAdd?: () => void }) {
  const [activeId, setActiveId] = useState<string | null>(paul.id);
  return (
    <WhoIsLearning
      learners={[paul, emma]}
      archived={[]}
      activeId={activeId}
      onSwitch={(p) => setActiveId(p.id)}
      onAdd={onAdd}
      onArchive={() => undefined}
      onRestore={() => undefined}
      onDelete={() => undefined}
    />
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('Who is learning', () => {
  it('lists each learner with what the tutor knows of them, and says so when it knows nothing', () => {
    render(<Harness />);
    const pauls = within(screen.getByRole('button', { name: /^Paul/ }));
    expect(pauls.getByText('7 years old, learns by doing, steady pace')).toBeTruthy();
    const emmas = within(screen.getByRole('button', { name: /^Emma/ }));
    expect(emmas.getByText('The tutor has not learned about them yet.')).toBeTruthy();
    expect(describeLearner(undefined)).toBe('The tutor has not learned about them yet.');
    expect(describeLearner(emptyProfile())).toBe('The tutor has not learned about them yet.');
  });

  it('switching changes the active learner and says so', () => {
    const { container } = render(<Harness />);
    const current = () => container.querySelector('[aria-current="true"]')?.textContent ?? '';
    expect(current()).toMatch(/^Paul/);
    fireEvent.click(screen.getByRole('button', { name: /^Emma/ }));
    expect(current()).toMatch(/^Emma/);
    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it('Add a learner asks the shell to start a new one', () => {
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a learner' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('a new learner is created with an empty learner profile, kept in the database', async () => {
    const made = await profileRepo.createLearner('Kit', 'star-trail', { ...DEFAULT_SETTINGS });
    expect(made.name).toBe('Kit');
    expect(made.themeId).toBe('star-trail');
    expect(made.learner).toEqual(emptyProfile());
    const stored = await profileRepo.getById(made.id);
    expect(stored?.learner).toEqual(emptyProfile());
    expect((await profileRepo.getActive()).map((p) => p.name)).toEqual(['Kit']);
  });

  it('keeps what the tutor learned when a learner is saved and read back', async () => {
    await db.profiles.add({ ...paul });
    const stored = await profileRepo.getById(paul.id);
    expect(describeLearner(stored?.learner)).toBe('7 years old, learns by doing, steady pace');
  });

  it('archives with a confirmation, and an archived learner can be restored', () => {
    const onArchive = vi.fn();
    const onRestore = vi.fn();
    render(
      <WhoIsLearning
        learners={[paul]}
        archived={[emma]}
        activeId={paul.id}
        onSwitch={() => undefined}
        onAdd={() => undefined}
        onArchive={onArchive}
        onRestore={onRestore}
        onDelete={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage Paul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onArchive).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledWith(paul.id);
    fireEvent.click(screen.getByRole('button', { name: /Show archived/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(emma.id);
  });
});

describe('the old picker is gone', () => {
  it('nothing in src names profile-selector', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/profile-selector/.test(readFileSync(path, 'utf8'))) hits.push(path);
      }
    };
    walk(join(__dirname, '../../src'));
    expect(hits).toEqual([]);
  });
});
