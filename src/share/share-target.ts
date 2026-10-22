// src/share/share-target.ts: SpellForge in the phone's share sheet (Share > SpellForge from Photos, a browser, any app).
// The manifest's share_target POSTs the shared pictures and words to SHARE_TARGET_PATH as multipart/form-data; src/sw.ts hands that
// request to receiveShare, which parks what came in (src/share/share-store.ts) and answers with a 303 to the tutor's address
// (tutorShareHash). The worker cannot show a screen: the window opens at the redirect, and the app reads the address
// (shareIdFromHash) and takes the share once (takeShare). Nothing is sent by itself: the share waits for a tap.
// The path is relative to the worker's scope (the manifest says it the same way), so a change of the app's base keeps it.
import { parkShare, takeParkedShare } from './share-store';

/** Where the manifest's share_target posts to, relative to the scope (public/manifest.json says the same; a test holds both). */
export const SHARE_TARGET_PATH = 'share-target';
/** The form fields the share_target names (public/manifest.json). */
export const SHARE_FILES_FIELD = 'files';
/** The kinds of file the share sheet offers SpellForge for. */
export const SHARE_FILE_ACCEPT = ['image/*'];

const TUTOR_SHARE_PREFIX = '#/tutor?share=';

/** The address the tutor opens at for the share `id`. */
export const tutorShareHash = (id: string): string => `${TUTOR_SHARE_PREFIX}${encodeURIComponent(id)}`;

/** The share id an address names, or null when it is not a share's address. */
export function shareIdFromHash(hash: string): string | null {
  if (!hash.startsWith(TUTOR_SHARE_PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(TUTOR_SHARE_PREFIX.length));
  return id === '' ? null : id;
}

/** Whether `request` is a share being posted to the target: a POST to the share path under `scope`. A GET to the same path is a page load, not a share. */
export function isShareRequest(request: Request, scope: string): boolean {
  return request.method === 'POST' && request.url === new URL(SHARE_TARGET_PATH, scope).href;
}

const redirectTo = (address: string): Response => Response.redirect(address, 303);

/** Parks the share a POST carries and answers with the redirect to the tutor. A share with nothing in it, or one that cannot be read, still opens the app, on Home. */
export async function receiveShare(request: Request, scope: string): Promise<Response> {
  try {
    const form = await request.formData();
    const files = await Promise.all(
      form
        .getAll(SHARE_FILES_FIELD)
        .filter((entry): entry is File => typeof entry !== 'string' && entry.size > 0)
        .map(async (file) => ({ name: file.name, type: file.type, bytes: await file.arrayBuffer() })),
    );
    const text = ['title', 'text', 'url']
      .map((field) => form.get(field))
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      .join('\n');
    if (files.length === 0 && !text) return redirectTo(scope);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await parkShare({ id, createdAt: Date.now(), text: text || undefined, files });
    return redirectTo(`${scope}${tutorShareHash(id)}`);
  } catch {
    return redirectTo(scope);
  }
}

/** What a share brought, as the page uses it: its pictures (image files only) and its words. */
export interface SharedItem {
  pictures: File[];
  text?: string;
}

/** Hands over the waiting share `id` names, once: a second call finds nothing. Undefined when nothing waits. */
export async function takeShare(id?: string): Promise<SharedItem | undefined> {
  const share = await takeParkedShare(id);
  if (!share) return undefined;
  const pictures = share.files
    .filter((file) => file.type.startsWith('image/'))
    .map((file) => new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
  return { pictures, text: share.text };
}
