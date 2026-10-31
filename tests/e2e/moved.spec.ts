// tests/e2e/moved.spec.ts (mw-79en7t.22): the page GitHub Pages serves at the old address, /spell-forge/. It is built the way the Pages workflow
// builds it (vite.moved.config.ts, base /spell-forge/) into a temp directory and served under /spell-forge/ by a small server of this spec's own.
// A child's data is put into the browser's IndexedDB the way the old app left it (the database 'SpellForgeDB'), then the page must offer to save it
// as a file with one tap, and offer the new link. Nothing here reaches the network.
//
// Run: npx playwright test moved --project=chromium
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
let out = '';
let server: Server | undefined;
let origin = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  out = mkdtempSync(join(tmpdir(), 'moved-'));
  execFileSync('npx', ['vite', 'build', '-c', 'vite.moved.config.ts', '--outDir', out, '--emptyOutDir'], { stdio: 'pipe' });
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/spell-forge/')) { res.writeHead(404).end('not found'); return; }
    let file = join(out, normalize(url.pathname.slice('/spell-forge/'.length)));
    if (!file.startsWith(out)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server!.listen(0, 'localhost', resolve));
  const address = server.address();
  origin = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
  rmSync(out, { recursive: true, force: true });
});

test('the old address says Kestrel moved, saves a child’s data in one tap and gives the new link', async ({ page }) => {
  await noTapGuard(page);
  await page.goto(`${origin}/spell-forge/`);
  await expect(page.getByRole('heading', { name: 'Kestrel has moved' })).toBeVisible();
  // Nothing on this device yet: the link is there, no save button.
  await expect(page.getByRole('link', { name: 'Open Kestrel' })).toHaveAttribute('href', 'https://kestrel.allmymind.org/');
  await expect(page.getByRole('button')).toHaveCount(0);

  // The old app's database now holds a child (the page itself opened it with the app's own schema).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('SpellForgeDB');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('profiles', 'readwrite');
          tx.objectStore('profiles').put({ id: 'p1', name: 'Rowan', avatar: '', themeId: 'dragon-forge', createdAt: new Date(), settings: {} });
          tx.oncomplete = () => { open.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();

  const save = page.getByRole('button', { name: 'Save Rowan’s data' });
  await expect(save).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  expect(download.suggestedFilename()).toBe('kestrel-rowan-backup.json');
  const path = await download.path();
  const payload = JSON.parse(readFileSync(path, 'utf-8')) as { profile: { id: string; name: string } };
  expect(payload.profile).toMatchObject({ id: 'p1', name: 'Rowan' });

  await expect(page.getByRole('link', { name: 'Open Kestrel' })).toHaveAttribute('href', 'https://kestrel.allmymind.org/');
  const widths = await page.evaluate(() => ({ window: window.innerWidth, page: document.documentElement.scrollWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  await shot(page, 'moved');
});

test('the page ships a worker that ends the old app’s cache and takes its place', async ({ request }) => {
  const res = await request.get(`${origin}/spell-forge/sw.js`);
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toContain('skipWaiting');
  expect(body).toContain('caches.delete');
});
