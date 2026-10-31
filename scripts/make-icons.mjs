// scripts/make-icons.mjs: renders public/kestrel.svg to public/icons/kestrel-192.png, kestrel-512.png and kestrel-maskable-512.png with
// Playwright's Chromium (`npm run icons`). The PNGs are committed; run this only when the glyph changes. (Ported from Lampas's.)
// The maskable icon is the same picture with square corners: the phone cuts its own shape, and the bird sits inside the middle 80% (the safe zone).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const extraLibDir = join(homedir(), '.cache', 'ms-playwright-system-libs', 'usr', 'lib', 'x86_64-linux-gnu');
const env = existsSync(extraLibDir)
  ? { ...process.env, LD_LIBRARY_PATH: [extraLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
  : process.env;

const svg = readFileSync('public/kestrel.svg', 'utf8');
const squareCorners = svg.replace('rx="56"', 'rx="0"');
if (squareCorners === svg) throw new Error('public/kestrel.svg has no rx="56" background to square off for the maskable icon');

const icons = [
  { file: 'kestrel-192.png', size: 192, svg },
  { file: 'kestrel-512.png', size: 512, svg },
  { file: 'kestrel-maskable-512.png', size: 512, svg: squareCorners },
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', env });
try {
  for (const { file, size, svg: source } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
    writeFileSync(`public/icons/${file}`, await page.screenshot({ type: 'png', omitBackground: true }));
    await page.close();
  }
} finally {
  await browser.close();
}
