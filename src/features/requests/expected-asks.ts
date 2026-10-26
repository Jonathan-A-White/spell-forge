// src/features/requests/expected-asks.ts — the asks people are expected to make of the maker, listed on Requests so nobody has to guess
// that an ask is welcome. Picking one takes them to the tutor to say it; the request that comes of it names the ask, so its row shows where
// it stands. @pwa-kit/requests checks the list (defineExpectedAsks) and draws a row's status (askRows).
import { defineExpectedAsks } from 'pwa-kit/requests';

export const EXPECTED_ASKS = defineExpectedAsks([
  { id: 'new-word-game', title: 'A new word game', kind: 'game', hint: 'A different way to practise words.', opening: 'a new word game' },
  { id: 'new-subject', title: 'Another subject to learn', kind: 'subject', hint: 'Reading, science, or anything else.', opening: 'another subject to learn' },
  { id: 'new-look', title: 'A new look', kind: 'look', hint: 'Colours, pictures or a theme.', opening: 'a new look for the app' },
  { id: 'new-setting', title: 'A new setting for grown-ups', kind: 'setting', hint: 'Something a grown-up should be able to change.', opening: 'a new setting' },
  { id: 'something-else', title: 'Something else', kind: 'other', hint: 'Anything the app does not do yet.', opening: 'something the app does not do yet' },
]);
