import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CREDITS, AboutScreen } from '../../src/features/about';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import {
  stalePackageCredits,
  uncreditedPackages,
  listShippedFiles,
  uncreditedFiles,
  type CreditLike,
} from '../fixtures/credits-check';

const root = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const readme = readFileSync(join(root, 'README.md'), 'utf8');

afterEach(cleanup);

describe('credits list', () => {
  it('credits every runtime dependency in package.json', () => {
    const missing = uncreditedPackages(CREDITS, pkg);
    expect(missing, `uncredited runtime dependencies: ${missing.join(', ')}`).toEqual([]);
  });

  it('names no package that is not in package.json (dependencies or devDependencies)', () => {
    const stale = stalePackageCredits(CREDITS, pkg);
    expect(stale, `credited packages no longer in package.json: ${stale.join(', ')}`).toEqual([]);
  });

  it('flags a credit for a package that was removed from package.json (fake list)', () => {
    const fake: CreditLike[] = [
      { name: 'Kept', kind: 'package', packages: ['kept'] },
      { name: 'Gone', kind: 'package', packages: ['gone-pkg'] },
      { name: 'Dev tool', kind: 'tool', packages: ['dev-only'] },
    ];
    const fakePkg = { dependencies: { kept: '1' }, devDependencies: { 'dev-only': '1' } };
    expect(stalePackageCredits(fake, fakePkg)).toEqual(['gone-pkg']);
    expect(uncreditedPackages(fake, { dependencies: { kept: '1', fresh: '1' } })).toEqual(['fresh']);
  });

  it('exempts credits that are not packages, by kind', () => {
    const fake: CreditLike[] = [
      { name: 'A book', kind: 'text' },
      { name: 'A font', kind: 'font' },
      { name: 'A service', kind: 'service' },
      { name: 'An idea', kind: 'idea' },
    ];
    expect(stalePackageCredits(fake, { dependencies: {} })).toEqual([]);
    expect(uncreditedPackages(fake, { dependencies: {} })).toEqual([]);
    // but a credit of kind 'package' must name a package
    expect(stalePackageCredits([{ name: 'Hollow', kind: 'package' }], { dependencies: {} })).toEqual(['Hollow']);
  });

  it('gives every credit a kind, and every real non-package credit is exempt from the package check', () => {
    for (const c of CREDITS) {
      expect(c.kind, `${c.name}: kind`).toBeTruthy();
    }
    expect(CREDITS.some((c) => c.kind !== 'package')).toBe(true);
  });

  it('credits every font and data file the app bundles (public/, and fonts anywhere in src/)', () => {
    const shipped = listShippedFiles(root);
    expect(shipped, 'found the bundled Tesseract data').toContain('public/tessdata/eng.traineddata');
    const missing = uncreditedFiles(CREDITS, shipped);
    expect(missing, `bundled files with no credit (name them in a credit's files): ${missing.join(', ')}`).toEqual([]);
  });

  it('flags a bundled file that no credit names (fake list)', () => {
    const fake: CreditLike[] = [{ name: 'Data', kind: 'data', files: ['public/data/'] }];
    expect(uncreditedFiles(fake, ['public/data/words.json', 'public/fonts/x.woff2'])).toEqual(['public/fonts/x.woff2']);
  });

  it('gives every credit a name, link, use, licence with a link, and its changes', () => {
    for (const c of CREDITS) {
      expect(c.name.trim(), 'name').not.toBe('');
      expect(c.name, `${c.name}: the name is link text, not a URL`).not.toMatch(/^https?:|www\./i);
      expect(c.url, `${c.name}: url`).toMatch(/^https:\/\//);
      expect(c.use.trim(), `${c.name}: use`).not.toBe('');
      expect(c.licence.name.trim(), `${c.name}: licence name`).not.toBe('');
      expect(c.licence.url, `${c.name}: licence url`).toMatch(/^https:\/\//);
      expect(c.changes.trim(), `${c.name}: changes`).not.toBe('');
    }
  });

  it('has no duplicate credit names', () => {
    const names = CREDITS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('credits the ideas and services the app leans on', () => {
    const names = CREDITS.map((c) => c.name).join('\n');
    for (const expected of ['Beads', 'Gas Town', 'Claude Code', 'WhatsOnChain', 'Patrick Hand']) {
      expect(names).toContain(expected);
    }
  });
});

describe('README', () => {
  it('has a Credits section naming every credit', () => {
    const at = readme.search(/^## Credits\s*$/m);
    expect(at, 'README has a "## Credits" heading').toBeGreaterThanOrEqual(0);
    const rest = readme.slice(at + 1);
    const next = rest.search(/^## /m);
    const section = next < 0 ? rest : rest.slice(0, next);
    for (const c of CREDITS) {
      expect(section, `README Credits names ${c.name}`).toContain(c.name);
    }
  });
});

describe('AboutScreen', () => {
  it('opens with Newton, attributed, then one sentence on why we credit, then the credits', () => {
    const { container } = render(<AboutScreen onBack={() => {}} />);
    const text = container.textContent ?? '';
    const quote = 'If I have seen further it is by standing on the shoulders of Giants.';
    expect(text).toContain(quote);
    expect(text).toContain('Isaac Newton');
    expect(text).toContain('Robert Hooke');
    expect(text).toContain('1675');
    const quoteAt = text.indexOf(quote);
    const whyAt = text.toLowerCase().indexOf('we credit');
    const firstCredit = text.indexOf(CREDITS[0].name);
    expect(whyAt).toBeGreaterThan(quoteAt);
    expect(firstCredit).toBeGreaterThan(whyAt);
  });

  it('shows each credit with its name as link text, its use, a licence link and its changes', () => {
    render(<AboutScreen onBack={() => {}} />);
    for (const c of CREDITS) {
      const nameLink = screen.getAllByRole('link', { name: c.name }).find((a) => a.getAttribute('href') === c.url);
      expect(nameLink, `${c.name} links to ${c.url}`).toBeDefined();
      expect(nameLink!.textContent).not.toMatch(/https?:\/\//);
      const item = nameLink!.closest('li')!;
      expect(within(item).getByText(c.use)).toBeInTheDocument();
      expect(within(item).getByText(c.changes)).toBeInTheDocument();
      const licenceLink = within(item).getByRole('link', { name: c.licence.name });
      expect(licenceLink).toHaveAttribute('href', c.licence.url);
    }
  });

  it('never shows a raw URL as visible text, and opens links safely in a new tab', () => {
    const { container } = render(<AboutScreen onBack={() => {}} />);
    expect(container.textContent).not.toMatch(/https?:\/\//);
    for (const a of screen.getAllByRole('link')) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('goes back', () => {
    const onBack = vi.fn();
    render(<AboutScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('Settings', () => {
  it('has an About & Credits entry that opens the About screen', () => {
    const onOpenAbout = vi.fn();
    render(
      <SettingsPanel
        profile={{ name: 'Rowan', themeId: 'dragon-forge' }}
        settings={DEFAULT_SETTINGS}
        onContrastModeChange={vi.fn()}
        onPresetApply={vi.fn()}
        onOpenBsvDebug={vi.fn()}
        onOpenAbout={onOpenAbout}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /about & credits/i }));
    expect(onOpenAbout).toHaveBeenCalled();
  });
});
