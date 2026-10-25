// src/worlds/maths/maths-pictures.ts — A maths concept as the picture module is asked about it (Kestrel 19d). The one module that draws a node's
// mnemonic picture is src/learn/mnemonic-pictures.ts (asks the mill once for a node, checks the SVG, keeps it by node id); the Maths world and
// the homework picture ask it (ConceptPicture.tsx) with the concept's id, its name and the words of its name for the picture to be one of. Never a second
// copy of the grind: no call, no storage and no SVG rule lives in this file.
import { MATHS_NODES } from '../../learn/maths';
import type { MnemonicNode } from '../../learn/mnemonic-pictures';

/** Words of a concept's name that picture nothing. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'by', 'for', 'from', 'has', 'how', 'in', 'is', 'of', 'on', 'or', 'the', 'to', 'up', 'what', 'which', 'with']);

/** The grind takes at most this many words of at most this many letters, and a name of at most 200. */
const MAX_WORDS = 12;
const MAX_WORD_LENGTH = 40;

/** The words of a concept's name a picture could be of ('Which group has more' is group and more); the whole name when none is left. */
export function conceptWords(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1 && word.length <= MAX_WORD_LENGTH && !SMALL_WORDS.has(word));
  const unique = [...new Set(words)].slice(0, MAX_WORDS);
  return unique.length > 0 ? unique : [name.trim().slice(0, MAX_WORD_LENGTH)];
}

/** The concept a node of the maths graph is, as the picture module is asked about it; undefined for an id the graph does not hold. */
export function conceptNode(nodeId: string | undefined): MnemonicNode | undefined {
  const node = MATHS_NODES.find((n) => n.id === nodeId);
  return node ? { id: node.id, name: node.name, words: conceptWords(node.name) } : undefined;
}
