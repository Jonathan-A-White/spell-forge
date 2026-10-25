// mw-79en7t.16, AC1: the words read from a photo of a list are placed on the spelling graph. An answer (version 2) names each word's
// node from the ones the request listed; a node the graph does not have falls back to the pattern match, with the reason kept.
import { describe, expect, it } from 'vitest';
import { SPELLING_NODES, spellingGraph } from '../../src/learn/spelling';
import { matchPattern, placeWords, requestNodes } from '../../src/learn/spelling/place-words';

const FIVE = [
  { word: 'badge', node: 'short-vowel-dge' },
  { word: 'light', node: 'vowel-team-igh' },
  { word: 'shop', node: 'digraph-sh' },
  { word: 'knee', node: 'silent-letter-kn-wr' },
  { word: 'jumping', node: 'suffix-ing' },
];

describe('placeWords', () => {
  it('places each of five words on the node the answer names', () => {
    const placed = placeWords(FIVE);
    expect(placed.map((p) => [p.word, p.nodeId, p.source])).toEqual(FIVE.map((f) => [f.word, f.node, 'grist']));
    for (const p of placed) expect(p.reason).toBeUndefined();
  });

  it('falls back to the pattern match for a node id the graph does not have, and keeps the reason', () => {
    const [p] = placeWords([{ word: 'badge', node: 'dge-after-short-vowels' }]);
    expect(p).toMatchObject({ word: 'badge', nodeId: 'short-vowel-dge', source: 'pattern' });
    expect(p.reason).toContain('dge-after-short-vowels');
  });

  it('falls back to the pattern match when the answer names no node for the word, saying so', () => {
    const [p] = placeWords([{ word: 'light', node: null }, ]);
    expect(p).toMatchObject({ nodeId: 'vowel-team-igh', source: 'pattern' });
    expect(p.reason).toMatch(/no node/i);
  });

  it('places the words of a version 1 answer (no nodes at all) by the pattern match', () => {
    const placed = placeWords([{ word: 'shop' }, { word: 'jumping' }]);
    expect(placed.map((p) => p.source)).toEqual(['pattern', 'pattern']);
    expect(placed[0].nodeId).toBe('digraph-sh');
  });

  it('leaves a word no pattern shows in with no node and a reason', () => {
    const [p] = placeWords([{ word: 'zap', node: 'not-a-node' }]);
    expect(p).toMatchObject({ nodeId: null, source: 'none' });
    expect(p.reason).toContain('not-a-node');
  });

  it('keeps the order, and a word the answer lists twice once', () => {
    const placed = placeWords([{ word: 'shop' }, { word: 'light' }, { word: 'Shop' }]);
    expect(placed.map((p) => p.word)).toEqual(['shop', 'light']);
  });
});

describe('matchPattern', () => {
  it('prefers the node that holds the word, then the longest pattern it shows', () => {
    expect(matchPattern('judge')?.nodeId).toBe('short-vowel-dge');
    expect(matchPattern('lightning')?.nodeId).toBe('vowel-team-igh');
  });

  it('finds the node that holds the word itself', () => {
    expect(matchPattern('cat')?.nodeId).toBe('short-vowel-a');
  });

  it('does not take a lone letter for a pattern, nor find a node for a word that is none of them', () => {
    expect(matchPattern('zap')).toBeNull();
  });
});

describe('requestNodes', () => {
  it('lists real nodes of the graph with a name and the patterns they teach, and no strategy node', () => {
    const nodes = requestNodes();
    expect(nodes.length).toBeGreaterThan(50);
    for (const n of nodes) {
      const node = spellingGraph.byId.get(n.id);
      expect(node, n.id).toBeDefined();
      expect(n.name).toBe((node as { name: string }).name);
      expect(n.patterns.length).toBeGreaterThan(0);
    }
    const strategies = SPELLING_NODES.filter((n) => n.strategy).map((n) => n.id);
    expect(nodes.some((n) => strategies.includes(n.id))).toBe(false);
  });
});
