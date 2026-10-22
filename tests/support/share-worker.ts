// tests/support/share-worker.ts: src/sw.ts run in jsdom as if it were the worker, to hand it the share-target POST a phone makes.
// The test file mocks 'workbox-precaching' and 'workbox-routing' itself (vi.mock is per file), then calls startWorker().
import { vi } from 'vitest';
import { SHARE_TARGET_PATH } from '../../src/share/share-target';

type FetchListener = (event: { request: Request; respondWith: (p: Promise<Response> | Response) => void }) => void;

export const SCOPE = `${window.location.origin}/spell-forge/`;
const fetchListeners: FetchListener[] = [];

/** Loads src/sw.ts with its fetch listeners captured, under the scope the app is served at. */
export async function startWorker(): Promise<void> {
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: FetchListener) => {
    if (type === 'fetch') fetchListeners.push(listener);
  }) as typeof window.addEventListener);
  Object.assign(window, { skipWaiting: vi.fn(), clients: { claim: vi.fn() }, registration: { scope: SCOPE }, __WB_MANIFEST: [] });
  // By a variable, so tsconfig.app.json's program does not follow the import into src/sw.ts: its webworker lib clashes with the DOM's.
  const worker = '../../src/sw';
  await import(/* @vite-ignore */ worker);
  vi.mocked(window.addEventListener).mockRestore();
}

/** The answer the worker gives to `request`, or undefined when no listener answered it. */
export async function answerTo(request: Request): Promise<Response | undefined> {
  let answer: Promise<Response> | Response | undefined;
  for (const listener of fetchListeners) listener({ request, respondWith: (p) => (answer = p) });
  return answer;
}

/** A POST to the share target. Node's Request cannot parse a jsdom File, so the request is a stand-in with the url, the method and the form. */
export function post(form: FormData, path = SHARE_TARGET_PATH): Request {
  return { method: 'POST', url: new URL(path, SCOPE).href, formData: async () => form } as unknown as Request;
}

export const picture = (name: string, bytes: number[], type = 'image/png'): File => new File([new Uint8Array(bytes)], name, { type });
