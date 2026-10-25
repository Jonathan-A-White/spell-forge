// tests/e2e/harness/front-door.tsx: the front door's screen in a real browser, for tests/e2e/front-door.spec.ts. The app does not draw
// FrontDoor yet (the real tutor-talk send to the factory is a story of its own), so this page does what the app will: it opens the
// database, keeps a child, parks a share when the address asks for one (`?share=picture-and-words`, `picture`, `words`) and takes it
// once as use-boot does, and draws the screen over the real flow and the real talks store. The grind is a stand-in that answers the
// same words and records what it was sent in window.__door.asked. Speech and the microphone are voice-kit's honest fakes.
import { StrictMode, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { installSpeech } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import { createDexieStore } from 'voice-kit/talks/dexie';
import '../../../src/index.css';
import { DEFAULT_SETTINGS } from '../../../src/accessibility/defaults';
import { openDatabase } from '../../../src/data/db';
import { profileRepo } from '../../../src/data/repositories';
import { FrontDoor } from '../../../src/features/front-door/FrontDoor';
import { FRONT_DOOR_TALKS_DB, createFrontDoorFlow, type TutorTalkSend } from '../../../src/features/front-door/front-door-flow';
import { setLicenceStatus } from '../../../src/shell/licence-gate';
import { parkShare } from '../../../src/share/share-store';
import { takeShare, type SharedItem } from '../../../src/share/share-target';

const TUTOR_SAYS = 'I can see your homework. Which question is the hard one?';
// a 1x1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

interface Asked {
  message: string;
  pictures: number | undefined;
  files: string[];
}
declare global {
  interface Window {
    __door: { asked: Asked[]; talks: () => Promise<string[]> };
  }
}

const params = new URLSearchParams(window.location.search);
const share = params.get('share');
const asked: Asked[] = [];
// reads the talks the flow keeps in its own store (the flow is given none, as the app will give it none)
const store = createDexieStore({ name: FRONT_DOOR_TALKS_DB, indexedDB, IDBKeyRange });
window.__door = {
  asked,
  // every turn of every kept talk, as 'role: text'
  talks: async () => {
    const lines: string[] = [];
    for (const summary of await store.list()) {
      for (const turn of (await store.get(summary.id))?.turns ?? []) lines.push(`${turn.role}: ${turn.text}`);
    }
    return lines;
  },
};

installSpeech(window, { msPerWord: 5, baseMs: 5, voicesDelayMs: 5 });
installMic(window, { clip: clips.english, grantMs: 5, openMs: 5, silenceMs: 5 });
if (params.get('licence') === 'none') setLicenceStatus({ state: 'none', checkedAt: '2026-10-24T10:00:00Z' });

const send: TutorTalkSend = async (request, files) => {
  asked.push({ message: request.message, pictures: request.pictures, files: files.map((file) => file.name ?? '') });
  return { words: TUTOR_SAYS };
};

async function boot(): Promise<void> {
  await openDatabase();
  const profile = (await profileRepo.getActive())[0] ?? (await profileRepo.createLearner('Rowan', 'dragon-forge', { ...DEFAULT_SETTINGS }));
  // The address names the share once; clearing it is what the app does, so a reload is a second boot.
  let shared: SharedItem | null = null;
  if (share) {
    window.history.replaceState(null, '', window.location.pathname);
    await parkShare({
      id: 'share-1',
      createdAt: Date.now(),
      text: share === 'picture' ? undefined : 'Question 4',
      files: share === 'words' ? [] : [{ name: 'homework.png', type: 'image/png', bytes: PNG.buffer as ArrayBuffer }],
    });
    shared = (await takeShare('share-1')) ?? null;
  }
  const real = createFrontDoorFlow({ send, profileId: profile.id, open: () => undefined });
  // a turn that fails is told on the console, where the spec can read it
  const flow = {
    ...real,
    start: () =>
      real.start().catch((error: unknown) => {
        console.error(`start failed: ${(error as Error).name} ${(error as Error).message}`);
        throw error;
      }),
    ask: (...args: Parameters<typeof real.ask>) =>
      real.ask(...args).catch((error: unknown) => {
        console.error(`ask failed: ${(error as Error).name} ${(error as Error).message}`);
        throw error;
      }),
  };
  function Door() {
    const [waiting, setWaiting] = useState(shared);
    return createElement(FrontDoor, { flow, open: () => undefined, shared: waiting, onSharedUsed: () => setWaiting(null) });
  }
  createRoot(document.getElementById('root')!).render(createElement(StrictMode, null, createElement(Door)));
}

void boot();
