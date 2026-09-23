// tests/features/steps/record-manifest.steps.ts — Reusable step bodies for
// tests/features/bsv/record-manifest.feature, wired in tests/features/bsv/record-manifest.test.ts.
// Calls straight into src/bsv/record.ts's encode/decode, the same way
// tests/unit/bsv-typed-record-manifest.test.ts does.
import { expect } from 'vitest';
import { Utils } from '@bsv/sdk';
import { decodeTypedRecordScript, encodeTypedRecordScript } from '../../../src/bsv/record';
import type { LockingScript } from '@bsv/sdk';

export interface RecordManifestContext {
  payloadBytes?: number[];
  script?: LockingScript;
  decoded?: ReturnType<typeof decodeTypedRecordScript>;
}

export function givenShortPayloadRecord(ctx: RecordManifestContext): void {
  ctx.payloadBytes = Utils.toArray('payload', 'utf8'); // 7 bytes: a single-byte push length
  ctx.script = encodeTypedRecordScript('W', ctx.payloadBytes);
}

export function givenTypeWRecord(ctx: RecordManifestContext): void {
  ctx.payloadBytes = Utils.toArray(
    JSON.stringify({ kind: 'write', origin: 'bb'.repeat(32) + ':0', text: 'hello', ts: '2026-09-23T00:00:00.000Z' }),
    'utf8',
  );
  ctx.script = encodeTypedRecordScript('W', ctx.payloadBytes);
}

export function whenScriptIsDecoded(ctx: RecordManifestContext): void {
  ctx.decoded = decodeTypedRecordScript(ctx.script as LockingScript);
}

export function thenScriptCarriesFieldsInOrder(ctx: RecordManifestContext): void {
  const hex = (ctx.script as LockingScript).toHex();
  const prefix = '006a076e667467617465' + '0102'; // OP_FALSE OP_RETURN push7'nftgate' push1(version=0x02)
  const typePush = '0157'; // push1 'W'
  const manifestPush = '0100'; // push1: a single zero byte — the empty manifest (0 entries)
  const payloadBytes = ctx.payloadBytes as number[];
  const payloadPush = payloadBytes.length.toString(16).padStart(2, '0') + Buffer.from(payloadBytes).toString('hex');
  expect(hex).toBe(prefix + typePush + manifestPush + payloadPush);
}

export function thenRecordHasVersionTypeAndEmptyManifest(ctx: RecordManifestContext): void {
  expect(ctx.decoded).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
}

export function thenPayloadRoundTrips(ctx: RecordManifestContext): void {
  expect(ctx.decoded!.payloadBytes).toEqual(ctx.payloadBytes);
}
