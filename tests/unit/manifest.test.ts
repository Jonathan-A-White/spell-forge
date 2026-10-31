// mw-79en7t.22: the manifest names the app Kestrel, is served from the root of kestrel.allmymind.org, and its icons are real files.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHARE_TARGET_PATH } from '../../src/share/share-target';

interface Icon { src: string; sizes: string; type: string; purpose?: string }
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf-8')) as {
  name: string; short_name: string; start_url: string; scope: string; icons: Icon[];
  share_target: { action: string };
};

/** The PNG's width and height, read from its IHDR chunk. */
function pngSize(path: string): { w: number; h: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('ascii'), `${path} is a PNG`).toBe('PNG');
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

describe('public/manifest.json', () => {
  it('names the app Kestrel', () => {
    expect(manifest.name).toBe('Kestrel');
    expect(manifest.short_name).toBe('Kestrel');
  });

  it('starts and is scoped at the root', () => {
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('has a 192, a 512 and a maskable 512 icon, and the files exist at that size', () => {
    const pick = (sizes: string, purpose: string) => manifest.icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
    for (const [sizes, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']] as const) {
      const icon = pick(sizes, purpose);
      expect(icon, `${sizes} ${purpose}`).toBeDefined();
      expect(icon!.type).toBe('image/png');
      const file = `public/${icon!.src.replace(/^\.?\//, '')}`;
      expect(existsSync(file), file).toBe(true);
      const px = Number(sizes.split('x')[0]);
      expect(pngSize(file)).toEqual({ w: px, h: px });
    }
  });

  it('also offers the logo as an svg, and it exists', () => {
    const svg = manifest.icons.find((i) => i.type === 'image/svg+xml');
    expect(svg?.src).toMatch(/kestrel\.svg$/);
    expect(existsSync(`public/${svg!.src.replace(/^\.?\//, '')}`)).toBe(true);
  });

  it('keeps the share target under the scope (story 3)', () => {
    const action = new URL(manifest.share_target.action, `https://kestrel.allmymind.org/manifest.json`);
    expect(action.pathname.startsWith(manifest.scope)).toBe(true);
    expect(action.pathname).toBe(`/${SHARE_TARGET_PATH}`);
  });

  it('has a wordmark, a logo with a title, and no file named for the old name', () => {
    expect(statSync('public/kestrel-wordmark.svg').size).toBeGreaterThan(200);
    expect(readFileSync('public/kestrel-wordmark.svg', 'utf-8')).toContain('Kestrel');
    expect(readFileSync('public/kestrel.svg', 'utf-8')).toContain('<svg');
    expect(existsSync('public/spell-forge.svg')).toBe(false);
  });

  it('is linked, with the logo and the name, by the page', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toContain('<title>Kestrel</title>');
    expect(html).toContain('content="Kestrel"');
    expect(html).toContain('%BASE_URL%kestrel.svg');
    expect(html).toContain('%BASE_URL%icons/kestrel-192.png');
    expect(html).not.toMatch(/spell-?forge/i);
  });
});
