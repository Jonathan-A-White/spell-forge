// src/features/composer/composer-settings.ts — How SpellForge's forms use voice-kit's Composer (mw-06ggew.9).
// One object for every form in a child's app: hold the bar to talk, letting go leaves the words in the box for a
// grown-up to fix, Send sends them, typing stays on; no attach and no camera (nothing here takes a file or a photo).
// Ask the tutor, a grown-ups' screen, takes pictures (mw-vmx5cb.1); the front door takes a photo and has no keyboard (Kestrel 13c).

import type { ComposerSettings } from 'voice-kit/composer';

export const SPELLFORGE_COMPOSER_SETTINGS: Partial<ComposerSettings> = {
  talk: 'hold',
  send: 'button',
  type: true,
  attach: false,
  camera: false,
};

/** Ask the tutor only: the same, with the camera and attach on so a parent can send up to 3 pictures with a question. */
export const ASK_THE_TUTOR_COMPOSER_SETTINGS: Partial<ComposerSettings> = {
  ...SPELLFORGE_COMPOSER_SETTINGS,
  attach: true,
  camera: true,
};

/** The front door (Kestrel 13c): the child talks and has the camera; there is no keyboard, and letting go of the bar sends what he said. */
export const FRONT_DOOR_COMPOSER_SETTINGS: Partial<ComposerSettings> = {
  ...SPELLFORGE_COMPOSER_SETTINGS,
  send: 'release',
  type: false,
  camera: true,
};
