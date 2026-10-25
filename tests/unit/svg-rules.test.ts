// mw-79en7t.46: Lampas's rules for a memory picture (its docs/pictures.md and tests/unit/pictures.test.ts), ported to
// src/learn/svg-rules.ts. Three of Lampas's own pictures are the fixtures that must pass; one broken each way must fail.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_PICTURE_BYTES, pictureProblems } from '../../src/learn/svg-rules';

const dir = 'tests/fixtures/pictures';
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.svg'));
const good = readFileSync(`${dir}/agapao.svg`, 'utf8');

describe("Lampas's picture rules hold on its own pictures", () => {
  it('has fixture pictures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
  });

  it.each(fixtures)('%s passes', (file) => {
    expect(pictureProblems(readFileSync(`${dir}/${file}`, 'utf8'))).toEqual([]);
  });
});

describe('a picture that breaks a rule fails, saying which', () => {
  const inside = (extra: string) => good.replace('</svg>', `${extra}</svg>`);
  const broken: [string, string, RegExp][] = [
    ['text', inside('<text x="8" y="40">cat</text>'), /text/],
    ['an image', inside('<image width="10" height="10"/>'), /image/],
    ['a script', inside('<script>alert(1)</script>'), /script/],
    ['an href', inside('<use href="#a"/>'), /href/],
    ['an xlink:href', good.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ').replace('</svg>', '<use xlink:href="#a"/></svg>'), /href/],
    ['a data URI', inside('<rect fill="url(data:image/png;base64,AAAA)"/>'), /data:/],
    ['an event handler', good.replace('<rect ', '<rect onclick="x()" '), /on[a-z]*/],
    ['a foreignObject', inside('<foreignObject/>'), /foreignObject/],
    ['the wrong grid', good.replace('0 0 96 96', '0 0 100 100'), /96/],
    ['no namespace', good.replace(' xmlns="http://www.w3.org/2000/svg"', ''), /namespace/],
    ['a root that is not svg', '<div viewBox="0 0 96 96"/>', /svg/],
    ['XML that does not parse', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect></svg>', /parse/],
    ['more than 2.5 KB', inside(`<!--${'x'.repeat(MAX_PICTURE_BYTES)}-->`), /2\.5 KB/],
    ['nothing', '', /./],
  ];

  it.each(broken)('%s', (_name, source, why) => {
    const problems = pictureProblems(source);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toMatch(why);
  });

  it('counts bytes, not characters, against the 2.5 KB', () => {
    const fits = inside(`<!--${'é'.repeat(1200)}-->`); // 1200 characters, 2400 bytes plus the picture: over
    expect(pictureProblems(fits).join(' ')).toMatch(/2\.5 KB/);
  });
});
