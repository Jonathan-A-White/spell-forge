// tests/fixtures/grist/bsv-kit-fake.ts — bsv-kit's fake Postern, set up for SpellForge's tests: it answers at the
// app's own backend address, seals answers to the device key, and the grists the app posted can be opened with the
// mill's key to see exactly what went out. No network.

import { EncryptedMessage, PrivateKey, Utils } from '@bsv/sdk';
import { grist } from 'bsv-kit/grist';
import { MILL_KEY, fakePostern } from 'bsv-kit/testing';
import type { FakePostern } from 'bsv-kit/testing';
import type { grist as kit } from 'bsv-kit/grist';
import { gristConfig } from '../../../src/grist';

export { MILL_KEY };

/** What the door is given as a key: the 32 bytes of the private key. */
export const keyBytes = (key: PrivateKey): Uint8Array => Uint8Array.from(key.toArray('be', 32));

/** A fake factory for `key`: GET /api/me names the mill, and `reply()` seals answers to the key. */
export const factoryFor = (key: PrivateKey): FakePostern => fakePostern({ base: gristConfig.backendUrl, appKey: keyBytes(key) });

export interface Delivered {
  grist: { app: string; kind: string; v: string };
  input: Record<string, unknown>;
  attachments: { hash: string; size: number; mime: string; name?: string }[];
}

const bodyText = (body: Uint8Array): string => Utils.toUTF8(Array.from(body));

/** Every grist the app posted to the fake, opened with the mill's key, oldest first. */
export function delivered(fake: FakePostern): Delivered[] {
  return fake.seen
    .filter((call) => call.method === 'POST' && call.path === '/messages')
    .map((call) => {
      const { scriptHex } = JSON.parse(bodyText(call.body as Uint8Array)) as { scriptHex: string };
      const { envelope } = grist.readRecordScript(scriptHex);
      return JSON.parse(grist.openCt(envelope.ct, MILL_KEY)) as Delivered;
    });
}

/** The bytes of every blob the app uploaded, opened with the mill's key, oldest first. */
export function uploaded(fake: FakePostern): Uint8Array[] {
  return fake.seen
    .filter((call) => call.method === 'POST' && call.path === '/blobs')
    .map((call) => Uint8Array.from(EncryptedMessage.decrypt(Array.from(call.body as Uint8Array), PrivateKey.fromHex(Utils.toHex(Array.from(MILL_KEY))))));
}

/** The mill's answer, filed at `seq` in the backend's sequence: an answer comes after the grist it answers. */
export function replyAt(fake: FakePostern, seq: number, answer: kit.GristAnswer): void {
  fake.reply(answer).seq = seq;
}
