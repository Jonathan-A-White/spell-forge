// mw-bhvxcn.6: sendGrist carries audio (up to 8 MiB) beside photos (up to 4 MiB), the mime from the Blob and the
// file's name, through the fake Postern server, which checks every signature.
import { describe, expect, it } from 'vitest';
import { EncryptedMessage, PrivateKey, PublicKey, Signature, Utils } from '@bsv/sdk';
import { GristLimitError, gristFileFromBlob, sendGrist } from '../../src/grist';
import type { GristFile } from '../../src/grist';
import { makeServer } from '../fixtures/grist/fake-postern';

const HEADER = { app: 'spellforge', kind: 'tutor-turn', v: '1' };
const PHOTO_LIMIT = 4_194_304;
const AUDIO_LIMIT = 8_388_608;
const bytes = (n: number) => new Uint8Array(n).map((_, i) => (i * 13 + n) % 256);

function plaintextOf(server: ReturnType<typeof makeServer>, millKey: PrivateKey) {
  const envelope = server.records[0].payload as { ct: string };
  return JSON.parse(Utils.toUTF8(EncryptedMessage.decrypt(Utils.toArray(envelope.ct, 'base64'), millKey))) as {
    grist: unknown;
    input: unknown;
    attachments: { hash: string; size: number; mime: string; name?: string }[];
  };
}

describe('sendGrist with files', () => {
  it('sends an audio/webm recording sealed to the mill, with its mime and its name, every call signed', async () => {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const audio: GristFile = { bytes: bytes(3000), mime: 'audio/webm', name: 'reading.webm' };

    const sent = await sendGrist({ key: appKey, files: [audio], input: { mode: 'reading' }, header: HEADER, fetchImpl: server.fetch });

    expect(sent.txid).toMatch(/^direct:[0-9a-f]{64}$/);
    const plain = plaintextOf(server, millKey);
    expect(plain.grist).toEqual(HEADER);
    expect(plain.attachments).toHaveLength(1);
    expect(plain.attachments[0]).toMatchObject({ mime: 'audio/webm', name: 'reading.webm', size: server.blobs.get(plain.attachments[0].hash)!.length });

    const body = server.blobs.get(plain.attachments[0].hash)!;
    expect(Uint8Array.from(EncryptedMessage.decrypt(Array.from(body), millKey))).toEqual(audio.bytes);
    expect(() => EncryptedMessage.decrypt(Array.from(body), appKey)).toThrow();

    // the fake server verified each challenge signature before it served the call; check the headers too
    expect(server.authorizations.length).toBeGreaterThanOrEqual(3);
    for (const header of server.authorizations) {
      const [pubkey, nonce, sig] = header.split(' ')[1].split(':');
      expect(pubkey).toBe(appKey.toPublicKey().toString());
      expect(PublicKey.fromString(pubkey).verify(nonce, Signature.fromDER(sig, 'hex'))).toBe(true);
    }
  });

  it('sends photos and audio together, naming only what has a name', async () => {
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const files: GristFile[] = [
      { bytes: bytes(500), mime: 'image/jpeg' },
      { bytes: bytes(700), mime: 'audio/ogg', name: 'clip.ogg' },
    ];
    await sendGrist({ key: PrivateKey.fromRandom(), files, input: {}, header: HEADER, fetchImpl: server.fetch });
    const { attachments } = plaintextOf(server, millKey);
    expect(attachments.map((a) => a.mime)).toEqual(['image/jpeg', 'audio/ogg']);
    expect(attachments[0]).not.toHaveProperty('name');
    expect(attachments[1].name).toBe('clip.ogg');
  });

  it('still takes photos in the old `photos` field', async () => {
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    await sendGrist({ key: PrivateKey.fromRandom(), photos: [{ bytes: bytes(10), mime: 'image/png' }], input: {}, header: HEADER, fetchImpl: server.fetch });
    expect(plaintextOf(server, millKey).attachments.map((a) => a.mime)).toEqual(['image/png']);
  });

  it('holds a photo to 4 MiB and audio to 8 MiB, and refuses other mimes, before any network call', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    const key = PrivateKey.fromRandom();
    const send = (files: GristFile[]) => sendGrist({ key, files, input: {}, header: HEADER, fetchImpl: server.fetch });

    await expect(send([{ bytes: bytes(PHOTO_LIMIT + 1), mime: 'image/jpeg' }])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([{ bytes: bytes(AUDIO_LIMIT + 1), mime: 'audio/webm' }])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([{ bytes: bytes(10), mime: 'audio/wav' }])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([{ bytes: bytes(10), mime: 'video/mp4' }])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send(Array.from({ length: 5 }, () => ({ bytes: bytes(10), mime: 'audio/webm' })))).rejects.toBeInstanceOf(GristLimitError);
    expect(server.calls).toEqual([]);

    // sealing 8 MiB takes seconds on a busy machine
    await expect(send([{ bytes: bytes(AUDIO_LIMIT), mime: 'audio/mp4' }])).resolves.toBeDefined();
  }, 60_000);
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
