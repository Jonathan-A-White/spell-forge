// src/features/about/credits.ts — Everything SpellForge builds on, credited by name (mw-vtjxh4.4).
//
// Every runtime dependency in package.json must be named in `packages` of one entry: tests/unit/credits.test.tsx
// fails when one is missing, so adding a library means crediting it in the same commit. The README's Credits
// section lists the same names; the test checks that too.

export interface Credit {
  /** Shown as the link text; never a URL. */
  name: string;
  /** Where the source lives. */
  url: string;
  /** npm packages in package.json `dependencies` this credit covers. */
  packages?: string[];
  /** What SpellForge uses it for. */
  use: string;
  licence: { name: string; url: string };
  /** What we changed, or that we changed nothing. */
  changes: string;
}

export const NEWTON_QUOTE = 'If I have seen further it is by standing on the shoulders of Giants.';
export const NEWTON_ATTRIBUTION = 'Isaac Newton, in a letter to Robert Hooke, 1675';
export const WHY_WE_CREDIT =
  'SpellForge stands on other people’s work, so we credit every text, tool, font and idea it is built on, whether or not the licence asks us to.';

export const CREDITS: readonly Credit[] = [
  // Libraries
  {
    name: 'React',
    url: 'https://react.dev',
    packages: ['react', 'react-dom'],
    use: 'Draws every screen.',
    licence: { name: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'React Router',
    url: 'https://reactrouter.com',
    packages: ['react-router-dom'],
    use: 'Installed for routing; screens are switched by hand today.',
    licence: { name: 'MIT', url: 'https://github.com/remix-run/react-router/blob/main/LICENSE.md' },
    changes: 'None; used as published.',
  },
  {
    name: 'Dexie.js',
    url: 'https://dexie.org',
    packages: ['dexie'],
    use: 'Keeps every profile, word list and score in the browser’s IndexedDB, so SpellForge works offline.',
    licence: { name: 'Apache-2.0', url: 'https://github.com/dexie/Dexie.js/blob/master/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'Tesseract.js',
    url: 'https://github.com/naptha/tesseract.js',
    packages: ['tesseract.js'],
    use: 'Reads a photo of a spelling list on the device, so the picture never has to leave it.',
    licence: { name: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js/blob/master/LICENSE.md' },
    changes: 'None; used as published.',
  },
  {
    name: 'Tesseract OCR English language data',
    url: 'https://github.com/tesseract-ocr/tessdata',
    use: 'The English model (eng.traineddata) Tesseract.js reads with, bundled so photo import works offline.',
    licence: { name: 'Apache-2.0', url: 'https://github.com/tesseract-ocr/tessdata/blob/main/LICENSE' },
    changes: 'None; the file is bundled as downloaded.',
  },
  {
    name: 'html5-qrcode',
    url: 'https://github.com/mebjas/html5-qrcode',
    packages: ['html5-qrcode'],
    use: 'Scans a QR code with the camera to import a shared word list.',
    licence: { name: 'Apache-2.0', url: 'https://github.com/mebjas/html5-qrcode/blob/master/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'node-qrcode',
    url: 'https://github.com/soldair/node-qrcode',
    packages: ['qrcode'],
    use: 'Draws the QR codes that share a word list and show this device’s public key.',
    licence: { name: 'MIT', url: 'https://github.com/soldair/node-qrcode/blob/master/license' },
    changes: 'None; used as published.',
  },
  {
    name: 'jsPDF',
    url: 'https://github.com/parallax/jsPDF',
    packages: ['jspdf'],
    use: 'Makes the printable word-list and practice sheets.',
    licence: { name: 'MIT', url: 'https://github.com/parallax/jsPDF/blob/master/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'uuid',
    url: 'https://github.com/uuidjs/uuid',
    packages: ['uuid'],
    
    use: 'Gives every profile, word and session its own id.',
    licence: { name: 'MIT', url: 'https://github.com/uuidjs/uuid/blob/main/LICENSE.md' },
    changes: 'None; used as published.',
  },
  {
    name: 'BSV SDK',
    url: 'https://github.com/bsv-blockchain/ts-stack/tree/main/packages/sdk',
    packages: ['@bsv/sdk'],
    use: 'Makes this device’s key and builds and signs the transactions that prove a licence.',
    licence: {
      name: 'Open BSV License',
      url: 'https://github.com/bsv-blockchain/ts-stack/blob/main/packages/sdk/LICENSE.txt',
    },
    changes: 'None; used as published.',
  },
  {
    name: 'bsv-kit',
    url: 'https://github.com/Jonathan-A-White/bsv-kit',
    packages: ['bsv-kit'],
    use: 'Our own shared kit for talking to the factory: it seals the questions the Tutor and photo import send, and opens the answers.',
    licence: { name: 'MIT', url: 'https://github.com/Jonathan-A-White/bsv-kit/blob/main/LICENSE' },
    changes: 'Written by us; shared with our other apps.',
  },
  // Build tools whose output ships in the app
  {
    name: 'Tailwind CSS',
    url: 'https://tailwindcss.com',
    use: 'Styles every screen.',
    licence: { name: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'Vite',
    url: 'https://vite.dev',
    use: 'Builds and bundles the app.',
    licence: { name: 'MIT', url: 'https://github.com/vitejs/vite/blob/main/LICENSE' },
    changes: 'None; used as published.',
  },
  // Fonts and icons
  {
    name: 'Patrick Hand',
    url: 'https://fonts.google.com/specimen/Patrick+Hand',
    packages: ['@fontsource/patrick-hand'],
    use: 'The handwriting font on printed practice sheets. The font by Patrick Wagesreiter reaches us through Fontsource.',
    licence: { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/open-font-license-official-text/' },
    changes: 'The printed sheets embed a Latin-only subset of the font, converted to base64.',
  },
  {
    name: 'OpenDyslexic',
    url: 'https://opendyslexic.org',
    use: 'The font the dyslexia-friendly preset asks for, used only if it is installed on the device.',
    licence: { name: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/open-font-license-official-text/' },
    changes: 'None; SpellForge does not ship the font, it only names it.',
  },
  {
    name: 'Feather icons',
    url: 'https://feathericons.com',
    use: 'Several of the small line icons on the Settings screen follow Feather’s shapes.',
    licence: { name: 'MIT', url: 'https://github.com/feathericons/feather/blob/main/LICENSE' },
    changes: 'Redrawn inline as SVG and recoloured with the theme.',
  },
  // Texts, word lists and algorithms
  {
    name: 'Fry Instant Words',
    url: 'https://en.wikipedia.org/wiki/Sight_word',
    use: 'Edward Fry’s list of the most common English words seeds the dictionary that corrects photo-import misreads.',
    licence: { name: 'Published word list, no licence stated', url: 'https://en.wikipedia.org/wiki/Sight_word' },
    changes: 'Mixed with common K–8 spelling vocabulary and sorted alphabetically.',
  },
  {
    name: 'SM-2 spaced repetition',
    url: 'https://super-memory.com/english/ol/sm2.htm',
    use: 'Piotr Woźniak’s SuperMemo algorithm decides when a word comes back for review.',
    licence: { name: 'Published algorithm, no licence stated', url: 'https://super-memory.com/english/ol/sm2.htm' },
    changes: 'Adapted for children: gentler intervals and word buckets (new, learning, familiar, mastered, review).',
  },
  // Outside services and platform features
  {
    name: 'Web Speech API',
    url: 'https://wicg.github.io/speech-api/',
    use: 'Says words aloud with the voices your phone or browser provides, so spelling words are spoken even offline.',
    licence: { name: 'Open web standard', url: 'https://wicg.github.io/speech-api/' },
    changes: 'None; we add retries and a slower speaking mode.',
  },
  {
    name: 'WhatsOnChain',
    url: 'https://whatsonchain.com',
    use: 'Looks up and broadcasts BSV transactions for the licence and record features.',
    licence: { name: 'WhatsOnChain API terms', url: 'https://docs.whatsonchain.com' },
    changes: 'None; we call the public API.',
  },
  {
    name: 'Claude',
    url: 'https://www.anthropic.com/claude',
    use: 'The AI model behind the Tutor’s answers, which reach the app through our own factory.',
    licence: { name: 'Anthropic Commercial Terms', url: 'https://www.anthropic.com/legal/commercial-terms' },
    changes: 'None; we give it instructions and read its answers.',
  },
  // Borrowed ideas and the tools that built the app
  {
    name: 'Claude Code',
    url: 'https://claude.com/product/claude-code',
    use: 'Anthropic’s coding assistant wrote and tested much of this app alongside Jonathan.',
    licence: { name: 'Anthropic Commercial Terms', url: 'https://www.anthropic.com/legal/commercial-terms' },
    changes: 'None; it is a tool we use.',
  },
  {
    name: 'Beads',
    url: 'https://github.com/steveyegge/beads',
    use: 'Steve Yegge’s issue tracker for AI agents is how the work on this app is planned and tracked.',
    licence: { name: 'MIT', url: 'https://github.com/steveyegge/beads/blob/main/LICENSE' },
    changes: 'None; used as published.',
  },
  {
    name: 'Gas Town',
    url: 'https://github.com/steveyegge/gastown',
    use: 'Steve Yegge’s ideas for running many AI workers shaped the factory that builds this app.',
    licence: { name: 'MIT', url: 'https://github.com/steveyegge/gastown/blob/main/LICENSE' },
    changes: 'Ideas only; no code copied.',
  },
  {
    name: 'Wings of Fire',
    url: 'https://en.wikipedia.org/wiki/Wings_of_Fire_(novel_series)',
    use: 'Tui T. Sutherland’s dragon books inspired the Dragon Forge theme.',
    licence: { name: 'Inspiration only; no text or art used', url: 'https://en.wikipedia.org/wiki/Wings_of_Fire_(novel_series)' },
    changes: 'Our dragons are our own drawings.',
  },
  {
    name: 'Plus-Plus',
    url: 'https://www.plusplus.com',
    use: 'The Plus-Plus building toy inspired the Monster Lab theme.',
    licence: { name: 'Inspiration only; no art used', url: 'https://www.plusplus.com' },
    changes: 'Our creatures are our own drawings.',
  },
];
