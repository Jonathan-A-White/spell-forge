// mw-79en7t.67 (Kestrel 13e): when a turn to the tutor-talk grind fails or runs out of time, the door says why in the words the send
// chose (tutor-talk-send.ts), through the real flow and its talks store; any other failure is the plain "could not answer".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { stop } from 'voice-kit/speech';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { FrontDoor } from '../../src/features/front-door/FrontDoor';
import { createFrontDoorFlow, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import { TutorTalkError } from '../../src/features/front-door/tutor-talk-send';
import { setLicenceStatus } from '../../src/shell/licence-gate';

let speech: SpeechFake;
let mic: ReturnType<typeof installMic>;
let store: DexieTalkStore;
let storeCount = 0;
let profileId: string;

beforeEach(async () => {
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  mic = installMic(window, { clip: clips.english, grantMs: 1, openMs: 1, silenceMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  db.close();
  await db.delete();
  await db.open();
  store = createDexieStore({ name: `front-door-says-why-${++storeCount}`, indexedDB, IDBKeyRange });
  profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  URL.createObjectURL = vi.fn(() => 'blob:shared');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  act(() => stop());
  mic.uninstall();
  speech.uninstall();
  store.close();
  setLicenceStatus(undefined);
});

const shared = { pictures: [new File([new Uint8Array([1, 2, 3])], 'homework.png', { type: 'image/png' })], text: 'Question 4' };

async function tapSend(send: TutorTalkSend) {
  const flow = createFrontDoorFlow({ send, store, profileId, open: () => undefined });
  render(<FrontDoor flow={flow} open={() => undefined} shared={shared} onSharedUsed={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Send this picture' }));
}

describe('the front door says why a turn failed (mw-79en7t.67 AC1)', () => {
  it('a send that cannot reach the tutor says so, and the picture stays to be sent again', async () => {
    await tapSend(async () => {
      throw new TutorTalkError('The tutor cannot be reached right now. Check the internet and try again.');
    });
    expect(await screen.findByText('The tutor cannot be reached right now. Check the internet and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send this picture' })).toBeInTheDocument();
    expect(screen.queryByText('Question 4', { selector: 'p.whitespace-pre-line' })).not.toBeNull();
  });

  it('a tutor who took too long says so', async () => {
    await tapSend(async () => {
      throw new TutorTalkError('The tutor took too long to answer. Hold the button and try again.');
    });
    expect(await screen.findByText('The tutor took too long to answer. Hold the button and try again.')).toBeInTheDocument();
  });

  it('any other failure is the plain one', async () => {
    await tapSend(async () => {
      throw new Error('boom');
    });
    expect(await screen.findByText('The tutor could not answer just now. Hold the button and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/boom/)).toBeNull();
  });
});
