// mw-79en7t.46: a drill asks the mill once for a node's mnemonic picture (grinds/mnemonic-picture.json), checks the
// SVG under Lampas's rules (src/learn/svg-rules.ts), keeps it in Dexie by node id, and with no licence makes no call.
// The grind is a fake here: the ask seam answers with whatever the test hands it.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/data/db';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import {
  MNEMONIC_PICTURE_GRIND,
  isMnemonicPictureAnswer,
  mnemonicPicture,
  mnemonicRequestFor,
} from '../../src/learn/mnemonic-pictures';
import type { MnemonicPictureRequest } from '../../src/learn/mnemonic-pictures';
import { spellingNode } from '../../src/learn/spelling';

const picture = readFileSync('tests/fixtures/pictures/agapao.svg', 'utf8');
const node = { id: 'vowel-team-ea-short', name: 'ea that says short e, like bread', words: ['bread', 'head', 'dead'] };

const fakeGrind = (svg: unknown = picture) => vi.fn<(request: MnemonicPictureRequest) => Promise<unknown>>().mockResolvedValue({ svg });

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => setLicenceStatus(undefined));

describe('the picture for a node', () => {
  it('asks the grind once and reuses the picture: a second ask makes no call', async () => {
    const ask = fakeGrind();
    expect(await mnemonicPicture(node, { ask })).toBe(picture);
    expect(await mnemonicPicture(node, { ask })).toBe(picture);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toEqual({ schemaVersion: '1', nodeId: node.id, name: node.name, words: node.words });
  });

  it('keeps it in Dexie by node id, so a reload still has it', async () => {
    await mnemonicPicture(node, { ask: fakeGrind() });
    expect((await db.mnemonicPictures.get(node.id))?.svg).toBe(picture);
    const later = fakeGrind();
    expect(await mnemonicPicture(node, { ask: later })).toBe(picture);
    expect(later).not.toHaveBeenCalled();
  });

  it('asks once for two drills that open together', async () => {
    const ask = fakeGrind();
    const both = await Promise.all([mnemonicPicture(node, { ask }), mnemonicPicture(node, { ask })]);
    expect(both).toEqual([picture, picture]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('keeps one picture for each node', async () => {
    const ask = fakeGrind();
    await mnemonicPicture(node, { ask });
    await mnemonicPicture({ ...node, id: 'vowel-team-oo' }, { ask });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(await db.mnemonicPictures.count()).toBe(2);
  });

  it.each([
    ['text', picture.replace('</svg>', '<text>cat</text></svg>')],
    ['over 2.5 KB', picture.replace('</svg>', `<!--${'x'.repeat(2600)}-->` + '</svg>')],
    ['the wrong grid', picture.replace('0 0 96 96', '0 0 64 64')],
    ['not a string', 42],
  ])('refuses an SVG with %s, and keeps nothing', async (_why, svg) => {
    expect(await mnemonicPicture(node, { ask: fakeGrind(svg) })).toBeUndefined();
    expect(await db.mnemonicPictures.count()).toBe(0);
  });

  it('answers nothing, and keeps nothing, when the grind fails', async () => {
    const ask = vi.fn(async () => {
      throw new Error('the factory is down');
    });
    expect(await mnemonicPicture(node, { ask })).toBeUndefined();
    expect(await db.mnemonicPictures.count()).toBe(0);
  });

  it('makes no call with no licence, and still shows a picture it already has', async () => {
    setLicenceStatus({ state: 'none', checkedAt: Date.now() } as never);
    const ask = fakeGrind();
    expect(await mnemonicPicture(node, { ask })).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
    await db.mnemonicPictures.put({ nodeId: node.id, svg: picture, createdAt: new Date() });
    expect(await mnemonicPicture(node, { ask })).toBe(picture);
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('the store', () => {
  it('is a table of the database, keyed by node id (schema v16)', () => {
    expect(db.verno).toBeGreaterThanOrEqual(16);
    expect(db.mnemonicPictures.schema.primKey.name).toBe('nodeId');
  });
});

describe('the grind', () => {
  it('is spellforge/mnemonic-picture v1, as grinds/mnemonic-picture.json says', () => {
    const grind = JSON.parse(readFileSync('grinds/mnemonic-picture.json', 'utf8')) as { app: string; kind: string; versions: string[] };
    expect(MNEMONIC_PICTURE_GRIND).toEqual({ app: grind.app, kind: grind.kind, v: grind.versions[0] });
  });

  it('reads an answer that is one SVG under the rules, and nothing else', () => {
    expect(isMnemonicPictureAnswer({ svg: picture })).toBe(true);
    expect(isMnemonicPictureAnswer({ svg: picture, extra: 1 })).toBe(false);
    expect(isMnemonicPictureAnswer({ svg: '<svg/>' })).toBe(false);
    expect(isMnemonicPictureAnswer(null)).toBe(false);
  });

  it("builds a request from a spelling node: its id, name and the node's words", () => {
    const spelling = spellingNode({
      id: 'x-test',
      band: '1-2',
      name: 'ea like bread',
      needs: [],
      patternIds: [],
      items: [['bread', 'ea', 'bred'], ['head', 'ea', 'hed'], ['dead', 'ea', 'ded']],
    });
    expect(mnemonicRequestFor({ id: spelling.id, name: spelling.name, words: spelling.items.map((i) => i.word) })).toEqual({
      schemaVersion: '1',
      nodeId: 'x-test',
      name: 'ea like bread',
      words: ['bread', 'head', 'dead'],
    });
  });
});
