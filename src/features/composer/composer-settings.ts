// src/features/composer/composer-settings.ts — How SpellForge's forms use voice-kit's Composer (mw-06ggew.9).
// One object for every form in a child's app: hold the bar to talk, letting go leaves the words in the box for a
// grown-up to fix, Send sends them, typing stays on; no attach and no camera (nothing here takes a file or a photo).

import type { ComposerSettings } from 'voice-kit/composer';

export const SPELLFORGE_COMPOSER_SETTINGS: Partial<ComposerSettings> = {
  talk: 'hold',
  send: 'button',
  type: true,
  attach: false,
  camera: false,
};
