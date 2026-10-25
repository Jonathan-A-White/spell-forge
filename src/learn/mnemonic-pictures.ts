// src/learn/mnemonic-pictures.ts — A mnemonic picture for a node (grinds/mnemonic-picture.json): the mill draws one SVG
// for a node, once; it is checked under Lampas's rules (svg-rules.ts) and kept in Dexie by node id, so a second ask
// for the node, in any drill, makes no call. This is the one copy: every screen that wants a node's picture asks here.
// A picture is decoration, never needed: no licence, a failed or late grind, or an SVG that breaks a rule all answer
// undefined, and the screen shows none. A refused SVG is not kept, so the node is asked about again next time.
import { PrivateKey } from '@bsv/sdk';
import type { MnemonicPicture } from '../contracts/types';
import { db } from '../data/db';
import { bsvWalletRepo } from '../data/repositories';
import { TUTOR_POLL_INTERVAL_MS, readAnswer, sendGrist } from '../grist';
import { gateGrind } from '../shell/licence-gate';
import { isPicture } from './svg-rules';

export const MNEMONIC_PICTURE_GRIND = { app: 'spellforge', kind: 'mnemonic-picture', v: '1' } as const;

/** How long the mill has to draw one picture. */
export const MNEMONIC_PICTURE_DEADLINE_MS = 180_000;

/** What a drill hands over about a node: a spelling node's id, its child-facing name and its words. */
export interface MnemonicNode {
  id: string;
  name: string;
  words: readonly string[];
}

/** grinds/mnemonic-picture.request.schema.json */
export interface MnemonicPictureRequest {
  schemaVersion: '1';
  nodeId: string;
  name: string;
  words: string[];
}

/** grinds/mnemonic-picture.answer.schema.json: one SVG under svg-rules.ts. */
export interface MnemonicPictureAnswer {
  svg: string;
}

const MAX_WORDS = 12;

export function mnemonicRequestFor(node: MnemonicNode): MnemonicPictureRequest {
  return { schemaVersion: '1', nodeId: node.id, name: node.name, words: node.words.slice(0, MAX_WORDS) };
}

/** The app's own check of an answer (run again before anything is kept): exactly `svg`, and it a picture. */
export function isMnemonicPictureAnswer(value: unknown): value is MnemonicPictureAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'svg' && isPicture((value as Record<string, unknown>).svg);
}

/** The seams; each defaults to the real thing, tests replace them. `ask` is the grind: it resolves with the answer's JSON. */
export interface MnemonicPictureDeps {
  ask?: (request: MnemonicPictureRequest) => Promise<unknown>;
  now?: () => Date;
}

/** The real grind: sends the request with the device key and reads the answer until the deadline. */
async function askMill(request: MnemonicPictureRequest): Promise<unknown> {
  const wallet = await bsvWalletRepo.getCurrent();
  if (!wallet) throw new Error('no wallet yet, so no key to ask with');
  const key = PrivateKey.fromWif(wallet.material);
  const sent = await sendGrist({ key, input: request, header: { ...MNEMONIC_PICTURE_GRIND } });
  const until = Date.now() + MNEMONIC_PICTURE_DEADLINE_MS;
  let since = sent.seq;
  while (Date.now() < until) {
    const read = await readAnswer({ key, txid: sent.txid, mill: sent.mill, since, isAnswer: isMnemonicPictureAnswer });
    since = read.next;
    if (!('pending' in read)) {
      if (read.answer.status === 'answered') return read.answer.answer;
      throw new Error(read.answer.reason);
    }
    await new Promise((resolve) => setTimeout(resolve, TUTOR_POLL_INTERVAL_MS));
  }
  throw new Error('the mill took too long to draw the picture');
}

const asking = new Map<string, Promise<string | undefined>>();

/**
 * The SVG for `node`, or undefined when there is none to show. A kept picture is returned with no call and whatever
 * the licence; otherwise, with a licence (src/shell/licence-gate.ts), one call is made for the node however many
 * drills ask at once, its SVG is checked and kept.
 */
export async function mnemonicPicture(node: MnemonicNode, deps: MnemonicPictureDeps = {}): Promise<string | undefined> {
  const kept = await db.mnemonicPictures.get(node.id);
  if (kept) return kept.svg;
  if (!gateGrind().allowed) return undefined;
  const running = asking.get(node.id);
  if (running) return running;
  const call = draw(node, deps).finally(() => asking.delete(node.id));
  asking.set(node.id, call);
  return call;
}

async function draw(node: MnemonicNode, deps: MnemonicPictureDeps): Promise<string | undefined> {
  try {
    const answer = await (deps.ask ?? askMill)(mnemonicRequestFor(node));
    if (!isMnemonicPictureAnswer(answer)) return undefined;
    const row: MnemonicPicture = { nodeId: node.id, svg: answer.svg, createdAt: (deps.now ?? (() => new Date()))() };
    await db.mnemonicPictures.put(row);
    return row.svg;
  } catch {
    return undefined;
  }
}
