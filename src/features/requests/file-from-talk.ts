// src/features/requests/file-from-talk.ts — a request to the maker, filed from a talk (mw-79en7t.20). When the tutor's answer says the
// app cannot do what was asked (maker_request), the front door's reply carries a MakerOffer and the screen offers "Send this to the
// maker"; nothing is sent without that tap. The tap calls sendToMaker, which files ONE request through @pwa-kit/requests with the
// talk's words and who asked (the child's id, or GROWN_UP): the same words from the same person in a day are the one request.
import { createJsonStore, createRequests, type FileResult, type MakerSender, type Requests, type StatusReader } from 'pwa-kit/requests';
import { APP_VERSION } from '../../version';
import { EXPECTED_ASKS } from './expected-asks';

/** What the tutor offered to pass on: the talk it came from, his words, and the tutor's one-line summary. */
export interface MakerOffer {
  talkId: string;
  words: string;
  summary: string;
}

/** The kind of a request the tutor offered; an expected ask files under its own kind. */
export const TUTOR_ASK_KIND = 'tutor-ask';

/** The phone's own key under which the requests are kept, one JSON list. */
export const REQUESTS_KEY = 'sf-maker-requests';

export interface MakerRequestsDeps {
  /** The wire to the maker (createMakerSender); a fake in tests. */
  send: MakerSender;
  /** The app's version, sent as app_version; the build's when absent. */
  appVersion?: string;
  /** Reads where open requests stand; without one they stay "Sent". */
  readStatuses?: StatusReader;
  /** The clock, in ms. */
  now?: () => number;
}

/** The requests, kept on the phone in localStorage, over the given wire. */
export function createMakerRequests(deps: MakerRequestsDeps): Requests {
  return createRequests({
    send: deps.send,
    store: createJsonStore(localStorage, REQUESTS_KEY),
    appVersion: deps.appVersion ?? APP_VERSION,
    ...(deps.readStatuses ? { readStatuses: deps.readStatuses } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
}

/**
 * Files the offer as one request by `who` (a learner's id, or GROWN_UP); `askId` names the expected ask it answers, so Requests can show
 * where that ask stands. 'sent' and 'duplicate' both mean it is with the maker; 'refused' carries words to show (the day's budget is spent).
 * A send that fails throws, with nothing kept, so the same words may be sent again.
 */
export function sendToMaker(requests: Requests, offer: MakerOffer, who: string, askId?: string): Promise<FileResult> {
  const kind = (askId && EXPECTED_ASKS.find((ask) => ask.id === askId)?.kind) || TUTOR_ASK_KIND;
  return requests.fileFromTalk({
    talkId: offer.talkId,
    words: offer.words,
    summary: offer.summary,
    who,
    kind,
    ...(askId ? { askId } : {}),
  });
}
