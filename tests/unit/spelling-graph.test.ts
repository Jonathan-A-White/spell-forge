// The spelling graph's shape and its phonics nodes (preK, K, 1-2): the graph validates through learn-kit, every band has the
// nodes it should, and every node carries what docs/spelling-graph.md says it does (mw-79en7t.42).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GraphError, order, validate } from 'learn-kit/graph';
import { findPatternById } from '../../src/core/phonics';
import {
  GRADE_BANDS,
  MIN_ITEMS,
  SPELLING_NODES,
  bandLevel,
  itemShowsPattern,
  nodeProblems,
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
    for (const file of ['graph.ts', 'items.ts', 'nodes-phonics.ts']) expect(doc, file).toContain(file);
    expect(doc).toContain('learn-kit/graph');
  });
});
