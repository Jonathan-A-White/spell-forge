// mw-bhvxcn.6: sendGrist carries audio (up to 8 MiB) beside photos, the mime from the Blob and the file's name,
// through bsv-kit's fake Postern. bsv-kit holds the file rules; this holds what the app sends and what it is told.
import { describe, expect, it } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { grist } from 'bsv-kit/grist';
import { gristFileFromBlob, sendGrist } from '../../src/grist';
import type { GristFile } from '../../src/grist';
import { delivered, factoryFor, uploaded } from '../fixtures/grist/bsv-kit-fake';

const HEADER = { app: 'spellforge', kind: 'tutor-turn', v: '1' };
const AUDIO_LIMIT = 8_388_608;
const bytes = (n: number) => new Uint8Array(n).map((_, i) => (i * 13 + n) % 256);

describe('sendGrist with files', () => {
  it('sends an audio/webm recording sealed to the mill, with its mime and its name', async () => {
    const key = PrivateKey.fromRandom();
    const fake = factoryFor(key);
    const audio: GristFile = { bytes: bytes(3000), mime: 'audio/webm;codecs=opus', name: 'reading.webm' };

    const sent = await sendGrist({ key, files: [audio], input: { mode: 'reading' }, header: HEADER, fetchImpl: fake.fetch });

    expect(sent).toMatchObject({ txid: expect.stringMatching(/^direct:[0-9a-f]{64}$/), seq: 1, mill: fake.mill });
    const [plain] = delivered(fake);
    expect(plain.grist).toEqual(HEADER);
    expect(plain.input).toEqual({ mode: 'reading' });
    expect(plain.attachments).toEqual([expect.objectContaining({ mime: 'audio/webm', name: 'reading.webm', size: fake.seen.find((c) => c.path === '/blobs')?.body?.length })]);
    expect(uploaded(fake)[0]).toEqual(audio.bytes);
  });

  it('sends photos and audio together, naming only what has a name, in the order given', async () => {
    const key = PrivateKey.fromRandom();
    const fake = factoryFor(key);
    const files: GristFile[] = [
      { bytes: bytes(500), mime: 'image/jpeg' },
      { bytes: bytes(700), mime: 'audio/ogg', name: 'clip.ogg' },
    ];
    await sendGrist({ key, files, input: {}, header: HEADER, fetchImpl: fake.fetch });
    const { attachments } = delivered(fake)[0];
    expect(attachments.map((a) => a.mime)).toEqual(['image/jpeg', 'audio/ogg']);
    expect(attachments[0]).not.toHaveProperty('name');
    expect(attachments[1].name).toBe('clip.ogg');
  });

  it('sends nothing when a file is one the mill would refuse: too much audio, another type, too many files', async () => {
    const key = PrivateKey.fromRandom();
    const fake = factoryFor(key);
    const send = (files: GristFile[]) => sendGrist({ key, files, input: {}, header: HEADER, fetchImpl: fake.fetch });

    await expect(send([{ bytes: bytes(AUDIO_LIMIT + 1), mime: 'audio/webm' }])).rejects.toBeInstanceOf(grist.GristInputError);
    await expect(send([{ bytes: bytes(10), mime: 'audio/wav' }])).rejects.toBeInstanceOf(grist.GristInputError);
    await expect(send([{ bytes: bytes(10), mime: 'video/mp4' }])).rejects.toBeInstanceOf(grist.GristInputError);
    await expect(send(Array.from({ length: 5 }, () => ({ bytes: bytes(10), mime: 'audio/webm' })))).rejects.toBeInstanceOf(grist.GristInputError);
    expect(fake.seen).toEqual([]);
  });

  it('sends nothing when an upload fails', async () => {
    const key = PrivateKey.fromRandom();
    const fake = factoryFor(key);
    fake.failBlobs = { status: 500, error: 'disk full' };
    await expect(sendGrist({ key, files: [{ bytes: bytes(10), mime: 'image/png' }], input: {}, header: HEADER, fetchImpl: fake.fetch })).rejects.toThrow('disk full');
    expect(delivered(fake)).toEqual([]);
  });

  it('fails when the backend names no mill, and sends nothing', async () => {
    const key = PrivateKey.fromRandom();
    const fake = factoryFor(key);
    fake.mill = '';
    await expect(sendGrist({ key, input: {}, header: HEADER, fetchImpl: fake.fetch })).rejects.toThrow(/no mill/);
    expect(delivered(fake)).toEqual([]);
  });
});

describe('gristFileFromBlob', () => {
  it('takes the bytes and the mime from the Blob, drops a codec suffix, and keeps the name', async () => {
    const blob = new Blob([bytes(64)], { type: 'audio/webm;codecs=opus' });
    const file = await gristFileFromBlob(blob, 'reading.webm');
    expect(file.mime).toBe('audio/webm');
    expect(file.name).toBe('reading.webm');
    expect(file.bytes).toEqual(bytes(64));
  });

  it('leaves the name out when there is none', async () => {
    const file = await gristFileFromBlob(new Blob([bytes(8)], { type: 'image/png' }));
    expect(file).toEqual({ bytes: bytes(8), mime: 'image/png' });
  });
});
