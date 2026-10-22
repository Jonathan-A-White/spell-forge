// mw-vmx5cb.1: Ask the tutor takes pictures. The Composer's camera and attach are on for this screen only; up to 3
// pictures go to the parent-ask grind as files, the request counts them (pictures), and the grind and its request
// schema allow them. The pictures a parent sent stay on the device with the ask, for its thumbnails.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrivateKey } from '@bsv/sdk';
import { grist } from 'bsv-kit/grist';
import { db } from '../../src/data/db';
import { parentAskRepo, tutorRepo } from '../../src/data/repositories';
import { ASK_THE_TUTOR_COMPOSER_SETTINGS, SPELLFORGE_COMPOSER_SETTINGS } from '../../src/features/composer/composer-settings';
import { PARENT_ASK_MAX_PICTURES, sendParentAsk } from '../../src/features/tutor';
import type { ParentAskDeps } from '../../src/features/tutor/parent-ask-flow';
import type { SendGristParams } from '../../src/grist';
import { paulProfile } from '../fixtures/profiles';
import { validate } from '../fixtures/grist/grind-examples';
import type { Schema } from '../fixtures/grist/grind-examples';

const root = process.cwd();
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;
const key = PrivateKey.fromRandom();

describe('the Composer settings of Ask the tutor', () => {
  it('has attach and camera on, and the rest of the child\'s settings', () => {
    expect(ASK_THE_TUTOR_COMPOSER_SETTINGS).toMatchObject({ ...SPELLFORGE_COMPOSER_SETTINGS, attach: true, camera: true });
  });

  it('leaves the settings of the child\'s tutor screens as they were: no attach, no camera', () => {
    expect(SPELLFORGE_COMPOSER_SETTINGS).toMatchObject({ talk: 'hold', send: 'button', type: true, attach: false, camera: false });
  });
});

function setup() {
  const sent: SendGristParams[] = [];
  const sendGrist = vi.fn(async (params: SendGristParams) => {
    sent.push(params);
    return { txid: `direct:${sent.length}`, seq: 0, mill: 'aa' };
  });
  // the shrinker is faked: the bytes it hands back name the picture it was given
  const shrink = vi.fn(async (blob: Blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type }));
  const deps: ParentAskDeps = { sendGrist, getKey: async () => key, shrink };
  return { sent, sendGrist, shrink, deps };
}
const picture = (text: string, type = 'image/jpeg') => new Blob([text], { type });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
});

describe('sendParentAsk with pictures', () => {
  it('sends 2 pictures as the files of the grist, and the request counts them', async () => {
    const client = setup();
    const ask = await sendParentAsk(
      { profileId: paulProfile.id, question: 'What does this page show?', pictures: [picture('one'), picture('two', 'image/png')] },
      client.deps,
    );
    const call = client.sent[0];
    expect(call.files).toHaveLength(2);
    expect(call.files?.map((f) => f.mime)).toEqual(['image/jpeg', 'image/png']);
    expect(call.files?.map((f) => new TextDecoder().decode(f.bytes))).toEqual(['one', 'two']);
    expect(call.files?.map((f) => f.name)).toEqual(['picture-1.jpg', 'picture-2.png']);
    expect(call.input).toMatchObject({ question: 'What does this page show?', pictures: 2 });
    expect(ask.request.pictures).toBe(2);
    expect(ask.status).toBe('waiting');
  });

  it('keeps the pictures with the ask, in the order they were sent, for its thumbnails', async () => {
    const client = setup();
    const ask = await sendParentAsk({ profileId: paulProfile.id, question: 'Look.', pictures: [picture('one'), picture('two')] }, client.deps);
    expect(ask.pictures).toHaveLength(2);
    const blobs = await Promise.all((ask.pictures ?? []).map((id) => tutorRepo.getBlob(id)));
    expect(blobs.map((b) => new TextDecoder().decode(new Uint8Array(b?.bytes ?? new ArrayBuffer(0))))).toEqual(['one', 'two']);
    expect((await parentAskRepo.get(ask.id))?.pictures).toEqual(ask.pictures);
  });

  it('with none, the request has pictures 0 and no files', async () => {
    const client = setup();
    const ask = await sendParentAsk({ profileId: paulProfile.id, question: 'How is he doing?' }, client.deps);
    const call = client.sent[0];
    expect(call.files ?? []).toEqual([]);
    expect(call.input).toMatchObject({ pictures: 0 });
    expect(client.shrink).not.toHaveBeenCalled();
    expect(ask.pictures ?? []).toEqual([]);
  });

  it('refuses a fourth picture before anything is stored', async () => {
    const client = setup();
    const four = [picture('1'), picture('2'), picture('3'), picture('4')];
    await expect(sendParentAsk({ profileId: paulProfile.id, question: 'Look.', pictures: four }, client.deps)).rejects.toThrow(/3 pictures/);
    expect(client.sendGrist).not.toHaveBeenCalled();
    expect(await parentAskRepo.listForProfile(paulProfile.id)).toEqual([]);
  });

  it('refuses a picture the kit cannot shrink, with its reason, before anything is stored', async () => {
    const client = setup();
    client.deps.shrink = async () => {
      throw new grist.GristInputError('This photo is too large to send, even made smaller.');
    };
    await expect(sendParentAsk({ profileId: paulProfile.id, question: 'Look.', pictures: [picture('x')] }, client.deps)).rejects.toThrow(/too large/);
    expect(await parentAskRepo.listForProfile(paulProfile.id)).toEqual([]);
  });

  it('still needs a question when pictures go with it', async () => {
    const client = setup();
    await expect(sendParentAsk({ profileId: paulProfile.id, question: '  ', pictures: [picture('x')] }, client.deps)).rejects.toThrow();
  });
});

interface GrindFile {
  attachments: { min: number; max: number; mime: string[]; maxBytes: number };
}

describe('grinds/parent-ask.json and its request schema', () => {
  it('allows up to 3 images, with the mimes of bsv-kit grist.PHOTO_MIMES', () => {
    const { attachments } = readJson<GrindFile>('grinds/parent-ask.json');
    expect(attachments.min).toBe(0);
    expect(attachments.max).toBe(PARENT_ASK_MAX_PICTURES);
    expect(attachments.max).toBe(3);
    expect([...attachments.mime].sort()).toEqual([...grist.PHOTO_MIMES].sort());
    expect(attachments.maxBytes).toBeGreaterThan(0);
    expect(attachments.maxBytes).toBeLessThanOrEqual(grist.MAX_PHOTO_BYTES);
  });

  it('the request schema accepts a pictures count from 0 to 3, and refuses more or a non-number', () => {
    const schema = readJson<Schema>('grinds/parent-ask.request.schema.json');
    const base = { schemaVersion: '1', question: 'What is this?', sessions: [] };
    for (const pictures of [0, 1, 2, 3]) expect(validate({ ...base, pictures }, schema)).toEqual([]);
    expect(validate(base, schema)).toEqual([]);
    expect(validate({ ...base, pictures: 4 }, schema)).not.toEqual([]);
    expect(validate({ ...base, pictures: -1 }, schema)).not.toEqual([]);
    expect(validate({ ...base, pictures: 'two' }, schema)).not.toEqual([]);
  });

  it('the instructions tell the tutor to read the pictures and name what it sees', () => {
    const text = readFileSync(join(root, 'grinds/parent-ask.instructions.md'), 'utf8');
    expect(text).toMatch(/`pictures`/);
    expect(text).toMatch(/name what (?:you|it) see/i);
  });

  it('has a pictured example scenario', () => {
    const request = readJson<{ request: { pictures?: number }; photos?: string[] }>('grinds/examples/parent-ask/pictured-page.json');
    expect(request.photos?.length).toBe(request.request.pictures);
    expect(request.request.pictures).toBeGreaterThan(0);
  });
});
