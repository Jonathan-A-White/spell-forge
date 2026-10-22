// src/share/share-out.ts: SpellForge out through the phone's share sheet. navigator.share where the phone has it, else the link is copied;
// closing the share sheet is not a failure; a refused copy hands the link back for the screen to show selected, to copy by hand.
// A tap must never end in nothing.

/** What a tap on a share button did. */
export type ShareOutResult =
  /** The share sheet took it. */
  | 'shared'
  /** The share sheet was opened and closed again: nothing to say. */
  | 'cancelled'
  /** The link is on the clipboard: say 'Link copied'. */
  | 'copied'
  /** The clipboard refused: show the link selected, read-only, to copy by hand. */
  | 'manual';

export interface ShareOutData {
  title?: string;
  text?: string;
  url: string;
}

/** The app's own address, which opens it cold (the base the build is served under). */
export function appLink(origin: string = window.location.origin): string {
  return new URL(import.meta.env.BASE_URL, origin).href;
}

const isAbort = (error: unknown): boolean => error instanceof DOMException && error.name === 'AbortError';

/** Copies `url`, or says the phone refused. */
async function copyLink(url: string): Promise<'copied' | 'manual'> {
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'manual';
  }
}

/** Shares `data` through the phone's share sheet, or copies its link when the phone has no sheet or the sheet failed. */
export async function shareOut(data: ShareOutData): Promise<ShareOutResult> {
  const hasSheet = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data));
  if (!hasSheet) return copyLink(data.url);
  try {
    await navigator.share(data);
    return 'shared';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    return copyLink(data.url);
  }
}
