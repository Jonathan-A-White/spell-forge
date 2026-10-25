// src/features/front-door/share-landing.ts — a share from the phone lands in the front door's talk (Kestrel 13d). "Take a screenshot and
// share with Kestrel, highlight text and share with Kestrel": what another app parked in the share store (src/share) becomes the
// learner's turn, the pictures as the turn's pictures and the words as what he "said". It lands once: taking the share removes it,
// so a second boot finds nothing. The talk is the flow's, kept in the talks store like every other turn. Nothing here sends by
// itself: the screen shows the share and lands it on a tap (FrontDoor.tsx), as the share practice asks (CLAUDE.md).
import type { OutgoingPicture } from 'voice-kit/talks';
import { takeShare, type SharedItem } from '../../share/share-target';
import { FRONT_DOOR_MAX_PICTURES, type FrontDoorFlow, type FrontDoorReply } from './front-door-flow';

/** The longest message a tutor-talk request takes (grinds/tutor-talk.request.schema.json). */
export const SHARE_MAX_MESSAGE_CHARS = 2000;

/** A share as one turn: the words, then the pictures that go with them. */
export interface SharedTurn {
  message: string;
  pictures: OutgoingPicture[];
}

/** The turn a share makes: its words (cut to the request's limit) and its first pictures, as bytes. Files that are not pictures are left out. */
export async function sharedTurn(item: SharedItem): Promise<SharedTurn> {
  const pictures = await Promise.all(
    item.pictures
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, FRONT_DOOR_MAX_PICTURES)
      .map(async (file) => ({ bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, name: file.name })),
  );
  return { message: (item.text ?? '').slice(0, SHARE_MAX_MESSAGE_CHARS), pictures };
}

/** Lands a share already taken as the next turn of talk `talkId`; the tutor's reply. */
export async function landShare(flow: FrontDoorFlow, talkId: string, item: SharedItem): Promise<FrontDoorReply> {
  const { message, pictures } = await sharedTurn(item);
  return flow.ask(talkId, message, pictures.length > 0 ? { pictures } : undefined);
}

/** Takes the waiting share (the one `id` names, else the newest) and lands it; undefined, and nothing asked, when nothing waits. */
export async function landParkedShare(flow: FrontDoorFlow, talkId: string, id?: string): Promise<{ item: SharedItem; reply: FrontDoorReply } | undefined> {
  const item = await takeShare(id);
  if (!item) return undefined;
  return { item, reply: await landShare(flow, talkId, item) };
}
