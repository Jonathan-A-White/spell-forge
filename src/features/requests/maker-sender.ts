// src/features/requests/maker-sender.ts — the wire to the maker: a grist of the maker-request grind (grinds/maker-request.json) carrying the
// request @pwa-kit/requests built. The grind forwards to the Mayor (no model reads it), so a send that the door took is a request with the
// maker; its txid is the id a later status names. Every way a send can fail is a MakerRequestError worded for the person who tapped.
import type { PrivateKey } from '@bsv/sdk';
import type { MakerSender } from 'pwa-kit/requests';
import { sendGrist, type GristHeader } from '../../grist';
import { NO_KEY, deviceKey, sayWhy } from '../tutor/tutor-flow';

export const MAKER_REQUEST_GRIND = { app: 'spellforge', kind: 'maker-request', v: '1' } as const satisfies GristHeader;

/** The schemaVersion of the grind's request (grinds/maker-request.request.schema.json). */
export const MAKER_REQUEST_SCHEMA_VERSION = '1';

const NOT_SENT = 'The request could not be sent just now. Tap Send again.';

/** A request that did not go, worded for the screen: nothing was kept. */
export class MakerRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MakerRequestError';
  }
}

/** The seams the sender runs on; each defaults to the real thing, tests replace them. */
export interface MakerSenderDeps {
  sendGrist?: typeof sendGrist;
  getKey?: () => Promise<PrivateKey | undefined>;
  fetchImpl?: typeof fetch;
}

export function createMakerSender(deps: MakerSenderDeps = {}): MakerSender {
  const send = deps.sendGrist ?? sendGrist;
  return async (request) => {
    const key = await (deps.getKey ?? deviceKey)();
    if (!key) throw new MakerRequestError(NO_KEY);
    try {
      const sent = await send({
        key,
        input: { schemaVersion: MAKER_REQUEST_SCHEMA_VERSION, ...request },
        header: { ...MAKER_REQUEST_GRIND },
        fetchImpl: deps.fetchImpl,
      });
      return { id: sent.txid };
    } catch (error) {
      throw new MakerRequestError(sayWhy(error, NOT_SENT));
    }
  };
}
