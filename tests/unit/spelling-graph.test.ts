// The spelling graph's shape and its phonics nodes (preK, K, 1-2): the graph validates through learn-kit, every band has the
// nodes it should, and every node carries what docs/spelling-graph.md says it does (mw-79en7t.42).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GraphError, order, validate } from 'learn-kit/graph';
import { findPatternById, patterns } from '../../src/core/phonics';
import { splitSyllables } from '../../src/core/phonics/syllabifier';
import { findTrickyPart, generateMnemonicAid } from '../../src/core/memory-aids';
import {
  GRADE_BANDS,
  MEMORY_AID_STRATEGIES,
  MIN_ITEMS,
  SPELLING_NODES,
  STRATEGY_KINDS,
  STRATEGY_NODES,
  bandLevel,
  itemShowsPattern,
  nodeProblems,
  PATTERN_NODES,
  nodesInBand,
  spellingGraph,
  type SpellingNode,
} from '../../src/learn/spelling';

const doc = readFileSync('docs/spelling-graph.md', 'utf8');

describe('the spelling graph', () => {
  it('validates through learn-kit: a DAG with no unknown needs', () => {
    expect(() => validate(SPELLING_NODES)).not.toThrow();
    expect(spellingGraph.nodes).toHaveLength(SPELLING_NODES.length);
    const sequence = order(spellingGraph);
    expect(sequence).toHaveLength(SPELLING_NODES.length);
    // every node comes after every node it needs
    for (const node of SPELLING_NODES) {
      for (const need of node.needs) expect(sequence.indexOf(need)).toBeLessThan(sequence.indexOf(node.id));
    }
  });

  it('refuses a cycle and an unknown need, naming the node', () => {
    const base = SPELLING_NODES[0];
    const cycle: SpellingNode[] = [
      { ...base, id: 'a', needs: ['b'] },
      { ...base, id: 'b', needs: ['a'] },
    ];
    expect(() => validate(cycle)).toThrow(GraphError);
    const unknown: SpellingNode[] = [{ ...base, id: 'lonely', needs: ['nowhere'] }];
    expect(() => validate(unknown)).toThrow(/lonely needs nowhere/);
  });

  it('has nodes in the bands preK, K and 1-2, the ones this story fills', () => {
    for (const band of ['preK', 'K', '1-2'] as const) expect(nodesInBand(band).length, band).toBeGreaterThan(0);
  });

  it('lists the six grade bands from the youngest up, each a level above the one before', () => {
    expect(GRADE_BANDS).toEqual(['preK', 'K', '1-2', '3-5', '6-8', '9-12']);
    GRADE_BANDS.forEach((band, i) => expect(bandLevel(band)).toBe(i));
  });

  it('puts a node at its band level, and never has it need a node of a later band', () => {
    for (const node of SPELLING_NODES) {
      expect(node.level, node.id).toBe(bandLevel(node.band));
      for (const need of node.needs) {
        expect(bandLevel(spellingGraph.byId.get(need)!.band), `${node.id} needs ${need}`).toBeLessThanOrEqual(bandLevel(node.band));
      }
    }
  });

  it('starts the youngest band from nothing, and every later node rests on something', () => {
    expect(nodesInBand('preK').some((n) => n.needs.length === 0)).toBe(true);
    for (const node of SPELLING_NODES.filter((n) => n.needs.length === 0)) expect(node.band, node.id).toBe('preK');
  });

  it('gives every node at least 3 items, a solid rule and a child-facing name', () => {
    for (const node of SPELLING_NODES) {
      expect(node.items.length, node.id).toBeGreaterThanOrEqual(MIN_ITEMS);
      expect(MIN_ITEMS).toBe(3);
      expect(node.solid.right, node.id).toBeGreaterThanOrEqual(1);
      expect(node.solid.of, node.id).toBeGreaterThanOrEqual(node.solid.right);
      expect(node.name.trim().length, node.id).toBeGreaterThan(0);
      expect(node.name, `${node.id} name is one line`).not.toMatch(/\n/);
    }
  });

  it('holds each item to a word, a pattern it shows and a distractor that does not', () => {
    for (const node of SPELLING_NODES) {
      for (const item of node.items) {
        expect(item.word, node.id).toMatch(/^[a-z]+$/);
        expect(item.distractor, `${node.id} ${item.word}`).toMatch(/^[a-z]+$/);
        expect(item.distractor, `${node.id} ${item.word}`).not.toBe(item.word);
        expect(itemShowsPattern(item.word, item.pattern), `${node.id}: ${item.word} shows ${item.pattern}`).toBe(true);
        expect(itemShowsPattern(item.distractor, item.pattern), `${node.id}: ${item.distractor} must not show ${item.pattern}`).toBe(false);
      }
      expect(new Set(node.items.map((i) => i.word)).size, `${node.id} lists a word twice`).toBe(node.items.length);
    }
  });

  it('has no node problems, and nodeProblems names what is wrong with a bad node', () => {
    for (const node of SPELLING_NODES) expect(nodeProblems(node), node.id).toEqual([]);
    const base = SPELLING_NODES[0];
    const bad: SpellingNode = {
      ...base,
      id: 'bad',
      name: ' ',
      solid: { right: 5, of: 3 },
      items: [{ word: 'cat', pattern: 'a', distractor: 'cat' }],
    };
    const problems = nodeProblems(bad).join('\n');
    expect(problems).toMatch(/bad: needs at least 3 items/);
    expect(problems).toMatch(/bad: no child-facing name/);
    expect(problems).toMatch(/bad: solid rule/);
    expect(problems).toMatch(/bad: cat is its own distractor/);
  });

  it('keeps ids unique, kebab-case and the same in the graph as in the node files', () => {
    const ids = SPELLING_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('points a node at patterns that exist in the phonics engine', () => {
    for (const node of SPELLING_NODES) for (const id of node.patternIds) expect(findPatternById(id), `${node.id}: ${id}`).toBeDefined();
    // the phonics nodes beyond the letter sounds are built from patterns.ts
    expect(SPELLING_NODES.filter((n) => n.patternIds.length > 0).length).toBeGreaterThan(10);
  });

  it('covers letter sounds, blends, digraphs, short vowels and long vowels', () => {
    const ids = SPELLING_NODES.map((n) => n.id).join(' ');
    for (const part of ['letter', 'short', 'long', 'digraph', 'blend']) expect(ids, part).toContain(part);
  });
});

describe('the pattern nodes (1-2 and 3-5)', () => {
  it('maps every pattern of src/core/phonics/patterns.ts to a node, naming any that is not', () => {
    const mapped = new Set(SPELLING_NODES.flatMap((n) => n.patternIds));
    const unmapped = patterns.filter((p) => !mapped.has(p.id)).map((p) => `${p.id} (${p.category})`);
    expect(unmapped, `patterns with no node: ${unmapped.join(', ')}`).toEqual([]);
  });

  it('has pattern nodes in bands 1-2 and 3-5, all resting on something and in the graph', () => {
    const ids = new Set(SPELLING_NODES.map((n) => n.id));
    for (const band of ['1-2', '3-5'] as const) {
      expect(PATTERN_NODES.filter((n) => n.band === band).length, band).toBeGreaterThan(0);
    }
    for (const node of PATTERN_NODES) {
      expect(['1-2', '3-5'], node.id).toContain(node.band);
      expect(node.needs.length, `${node.id} rests on something`).toBeGreaterThan(0);
      expect(ids.has(node.id), `${node.id} is in the graph`).toBe(true);
    }
  });

  it('covers vowel teams, r-controlled vowels, silent letters, doubling and dropping rules, plurals, prefixes and suffixes', () => {
    const ids = PATTERN_NODES.map((n) => n.id).join(' ');
    for (const part of ['vowel-team', 'r-controlled', 'silent', 'doubling', 'drop', 'plural', 'prefix', 'suffix']) {
      expect(ids, part).toContain(part);
    }
  });
});

const strategyOf = (kind: string, band: string) => STRATEGY_NODES.filter((n) => n.strategy === kind && n.band === band);

describe('the strategy nodes (3-5, 6-8, 9-12)', () => {
  it('names the five strategies: syllables, roots and affixes, analogy, mnemonic and the visual check', () => {
    expect([...STRATEGY_KINDS]).toEqual(['syllables', 'roots-affixes', 'analogy', 'mnemonic', 'visual-check']);
  });

  it('has every strategy in each of the bands 3-5, 6-8 and 9-12, and nowhere younger', () => {
    for (const kind of STRATEGY_KINDS) {
      for (const band of ['3-5', '6-8', '9-12']) expect(strategyOf(kind, band).length, `${kind} in ${band}`).toBeGreaterThan(0);
    }
    for (const node of STRATEGY_NODES) expect(['3-5', '6-8', '9-12'], node.id).toContain(node.band);
  });

  it('puts the strategy nodes in the graph, each resting on something it builds on and on its own earlier band', () => {
    const ids = new Set(SPELLING_NODES.map((n) => n.id));
    for (const node of STRATEGY_NODES) {
      expect(ids.has(node.id), `${node.id} is in the graph`).toBe(true);
      expect(node.needs.length, `${node.id} rests on something`).toBeGreaterThan(0);
      expect(node.tags, node.id).toContain('strategy');
    }
    // a 6-8 or 9-12 strategy builds on the same strategy a band lower
    for (const node of STRATEGY_NODES.filter((n) => n.band !== '3-5')) {
      const lower = node.needs.map((id) => spellingGraph.byId.get(id)!).filter((n) => (n as SpellingNode).strategy === node.strategy);
      expect(lower.length, `${node.id} needs the ${node.strategy} strategy of a lower band`).toBeGreaterThan(0);
    }
  });

  it('has nodes in every grade band, and the graph validates', () => {
    for (const band of GRADE_BANDS) expect(nodesInBand(band).length, band).toBeGreaterThan(0);
    expect(() => validate(SPELLING_NODES)).not.toThrow();
  });

  it('draws the syllable nodes from words the syllabifier splits into three parts or more', () => {
    for (const node of STRATEGY_NODES.filter((n) => n.strategy === 'syllables')) {
      for (const item of node.items) expect(splitSyllables(item.word).length, `${node.id}: ${item.word}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws the first mnemonic node from words the memory aid has a story or phrase for', () => {
    for (const node of strategyOf('mnemonic', '3-5')) {
      for (const item of node.items) {
        const labels = generateMnemonicAid(item.word).tricks.map((t) => t.label);
        expect(labels.some((l) => l === 'Story' || l === 'Remember'), `${item.word} has a mnemonic`).toBe(true);
      }
    }
  });

  it('draws the first visual-check node from the tricky part the memory aid spotlights', () => {
    for (const node of strategyOf('visual-check', '3-5')) {
      for (const item of node.items) expect(findTrickyPart(item.word)?.grapheme, item.word).toBe(item.pattern);
    }
  });

  it('draws the words-inside node from words where the memory aid finds a word inside', () => {
    const node = STRATEGY_NODES.find((n) => n.id === 'strategy-words-inside')!;
    for (const item of node.items) {
      expect(generateMnemonicAid(item.word).tricks.map((t) => t.label), item.word).toContain('Words inside');
    }
  });
});

describe('the sweep of memory-aid kinds', () => {
  const source = (file: string) => readFileSync(`src/core/memory-aids/${file}`, 'utf8');
  const rows = MEMORY_AID_STRATEGIES;

  it('lists every aid type of src/core/memory-aids', () => {
    const types = ['phonetic-aid.ts', 'pattern-aid.ts', 'mnemonic-aid.ts'].flatMap((f) => [...source(f).matchAll(/type: '([a-z]+)'/g)].map((m) => m[1]));
    expect(types.sort()).toEqual(['mnemonic', 'pattern', 'phonetic']);
    for (const type of types) expect(rows.some((r) => r.aid === type && r.label === undefined), `aid type ${type}`).toBe(true);
  });

  it('lists every memory trick label of mnemonic-aid.ts', () => {
    const labels = new Set([...source('mnemonic-aid.ts').matchAll(/label: '([^']+)'/g)].map((m) => m[1]));
    expect(labels.size).toBeGreaterThan(4);
    for (const label of labels) expect(rows.some((r) => r.aid === 'mnemonic' && r.label === label), `trick label ${label}`).toBe(true);
  });

  it('lists the tricky part', () => {
    expect(rows.some((r) => r.aid === 'tricky-part')).toBe(true);
    expect(source('tricky-part.ts')).toContain('export function findTrickyPart');
  });

  it('gives every kind a strategy node that is in the graph with that strategy', () => {
    for (const row of rows) {
      const node = spellingGraph.byId.get(row.node) as SpellingNode | undefined;
      expect(node, `${row.aid} ${row.label ?? ''} -> ${row.node}`).toBeDefined();
      expect(node!.strategy, row.node).toBe(row.strategy);
      expect(node!.band, row.node).toBe('3-5');
    }
  });

  it('is written out in docs/spelling-graph.md, one line a kind with its node', () => {
    for (const row of rows) expect(doc, `${row.aid} ${row.label ?? ''}`).toContain(`\`${row.node}\``);
    for (const kind of STRATEGY_KINDS) expect(doc, kind).toContain(kind);
    expect(doc).toContain('nodes-strategies.ts');
  });
});

describe('docs/spelling-graph.md', () => {
  it('names every grade band', () => {
    for (const band of GRADE_BANDS) expect(doc, band).toContain(`\`${band}\``);
  });

  it('names the node shape: its id, needs, solid rule, items and name', () => {
    for (const field of ['id', 'band', 'needs', 'solid', 'items', 'name']) expect(doc, field).toContain(`\`${field}\``);
    for (const part of ['word', 'pattern', 'distractor']) expect(doc, part).toContain(`\`${part}\``);
  });

  it('says how to add a node', () => {
    expect(doc).toMatch(/^#+ .*add a node/im);
  });

  it('names every node file and the learn-kit graph it is validated over', () => {
    for (const file of ['graph.ts', 'items.ts', 'nodes-phonics.ts', 'nodes-patterns.ts', 'nodes-strategies.ts']) expect(doc, file).toContain(file);
    expect(doc).toContain('learn-kit/graph');
  });
});
