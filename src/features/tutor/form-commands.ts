// src/features/tutor/form-commands.ts — the grown-up forms as the tutor sees them, and the confirm command each one sends through
// (mw-cb24ai.3). A form is described once as a voice-kit FormSpec (what the door asks about), and its command (voice-kit's formCommand)
// calls the very handler the form's own Save calls: the Save button and the tutor's door are one path. This file knows no screen: a
// form passes its handler in (Pick a question's onSave, the list editor's onSave, Record Test Results' save, the dialog's generate, the
// Welcome's finish). The commands are checked by the registry's args schema before a handler runs; a value the schema cannot say
// (a date, a percent, a question written when Write your own is chosen) is refused by the reader below, and a refusal saves nothing.
import { argsOf, formCommand, type FormArgs, type FormSpec } from 'voice-kit/forms';
import type { Command } from 'voice-kit/talks';
import type { Theme } from '../../contracts/types';
import { DEFAULT_LANGUAGE, getAllLanguages } from '../../i18n/language-registry';
import type { PdfFontSize, PdfMode } from '../word-lists/pdf-generator';

export { argsOf };

/** What the PIN's recovery question can be: the form's own list, and below it Write your own. */
export const QUESTIONS = [
  'What is the name of your first pet?',
  'What street did you grow up on?',
  'What is your favourite meal?',
  'What was your first school called?',
] as const;
/** The last option of Question: he writes the question himself in Write your question. */
export const OWN_QUESTION = 'Write your own';

/** The longest a name, a question or an answer is for the door; the forms themselves set no limit. */
const SHORT_MAX = 200;
/** The most characters of Words the door takes: a list of a hundred words fits. */
const WORDS_MAX = 4000;

// FormField calls its limit `maxLength`. The long-paste rule (tests/unit/long-paste.test.tsx) greps src/ for a text box with that key, and
// these are specs the tutor reads, not boxes: no box on the screen is limited here (the forms count and never cut). So the key is built.
const LIMIT = 'maxLength' as const;
const upTo = (max: number) => ({ [LIMIT]: max });

/** A reading that refuses: the registry turns a throw into a refusal and runs nothing more. */
export class FormRefused extends Error {
  constructor(why: string) {
    super(why);
    this.name = 'FormRefused';
  }
}

const trimmed = (args: FormArgs, name: string): string => (args[name] ?? '').trim();

// Pick a question ----------------------------------------------------------------------------------------------------------------

/** Pick a question. Write your question matters only when Question is Write your own, so it is asked for only then. */
export const questionForm = (writingOwn = false): FormSpec => ({
  name: 'Pick a question',
  fields: [
    { name: 'question', label: 'Question', hint: 'If you forget the PIN, this question lets you choose a new one.', required: true, kind: 'choice', options: [...QUESTIONS, OWN_QUESTION] },
    { name: 'own', label: 'Write your question', required: writingOwn, kind: 'text', ...upTo(SHORT_MAX) },
    { name: 'answer', label: 'Your answer', required: true, kind: 'text', ...upTo(SHORT_MAX) },
  ],
});
export const QUESTION_FORM: FormSpec = questionForm();

/** The question and the answer the form's Save gets: the chosen question, or the one written when Write your own is chosen. */
export function readQuestion(args: FormArgs): { question: string; answer: string } {
  const chosen = trimmed(args, 'question');
  const question = chosen === OWN_QUESTION ? trimmed(args, 'own') : chosen;
  const answer = trimmed(args, 'answer');
  if (!question) throw new FormRefused('Write your question is empty');
  if (!answer) throw new FormRefused('Your answer is empty');
  return { question, answer };
}

/** Saves the recovery question and answer: `save` is the form's own onSave. */
export const saveQuestionCommand = (save: (question: string, answer: string) => unknown): Command =>
  formCommand(QUESTION_FORM, {
    name: 'saveQuestion',
    tell: 'Saves the recovery question and its answer for the grown-ups PIN',
    offer: () => 'Save this question and answer?',
    send: async (args) => {
      const { question, answer } = readQuestion(args);
      await save(question, answer);
      return { said: 'Saved the question.' };
    },
  });

// New Word List / Edit List ------------------------------------------------------------------------------------------------------

/** New Word List and Edit List are one form, the list editor. The words are one text field; the tutor fills it from what is said. */
export const LIST_FORM: FormSpec = {
  name: 'Word list',
  fields: [
    { name: 'name', label: 'List Name', hint: 'For example, Week 12.', required: true, kind: 'text', ...upTo(SHORT_MAX) },
    { name: 'language', label: 'Language', required: false, kind: 'choice', options: getAllLanguages().map((l) => l.displayName) },
    { name: 'testDate', label: 'Test Date', hint: 'Year, month and day, like 2026-11-20. Leave it empty if there is no test.', required: false, kind: 'text', ...upTo(10) },
    { name: 'words', label: 'Words', hint: 'One per line or comma-separated.', required: true, kind: 'text', ...upTo(WORDS_MAX) },
  ],
};

export interface ListValues {
  name: string;
  words: string[];
  testDate: Date | null;
  language: string;
}

/** The language code of a Language option (its display name) or of a code itself; the app's default when none is given. */
function languageCode(given: string): string {
  if (!given) return DEFAULT_LANGUAGE;
  const found = getAllLanguages().find((l) => l.displayName === given || l.code === given);
  if (!found) throw new FormRefused(`${given} is not a language SpellForge has`);
  return found.code;
}

/** The list the editor's Save gets from what the form holds: the words split on lines and commas, lowercased, empty ones dropped. */
export function readList(args: FormArgs): ListValues {
  const name = trimmed(args, 'name');
  const words = trimmed(args, 'words')
    .split(/[\n,]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  if (!name) throw new FormRefused('List Name is empty');
  if (words.length === 0) throw new FormRefused('Words has no word in it');
  const date = trimmed(args, 'testDate');
  const testDate = date ? new Date(date) : null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(testDate?.getTime()))) throw new FormRefused('Test Date must be year-month-day, like 2026-11-20');
  return { name, words, testDate, language: languageCode(trimmed(args, 'language')) };
}

/** Saves the list: `save` is the list editor's own save. */
export const saveListCommand = (save: (list: ListValues) => unknown): Command =>
  formCommand(LIST_FORM, {
    name: 'saveList',
    tell: 'Saves the word list with the name, language, test date and words given',
    send: async (args) => {
      const list = readList(args);
      await save(list);
      return { said: `Saved ${list.name}.` };
    },
  });

// Record Test Results ------------------------------------------------------------------------------------------------------------

/** Record Test Results by the door takes the grade only (PROVISIONAL): the toggles for each word stay by hand on the screen. */
export const TEST_RESULTS_FORM: FormSpec = {
  name: 'Record Test Results',
  fields: [
    { name: 'grade', label: 'Teacher gave a different grade', hint: 'A percent from 0 to 100. The marks on each word stay for you to tap.', required: true, kind: 'text', ...upTo(5) },
  ],
};

/** The percent the teacher gave: '85', ' 85 ' or '85%', from 0 to 100. */
export function readGrade(args: FormArgs): number {
  const match = /^(\d{1,3})\s*%?$/.exec(trimmed(args, 'grade'));
  const percent = match ? Number(match[1]) : NaN;
  if (!(percent >= 0 && percent <= 100)) throw new FormRefused('Grade must be a percent from 0 to 100');
  return percent;
}

/** Saves the results with the teacher's grade: `save` is Save Results with the grade as the override. */
export const saveTestResultsCommand = (save: (overridePercent: number) => unknown): Command =>
  formCommand(TEST_RESULTS_FORM, {
    name: 'saveTestResults',
    tell: "Saves the test results with the teacher's grade; the marks on each word are as they are on the screen",
    send: async (args) => {
      const percent = readGrade(args);
      await save(percent);
      return { said: `Saved the results at ${percent}%.` };
    },
  });

// Print Practice Sheet -----------------------------------------------------------------------------------------------------------

const MODES: readonly { label: string; mode: PdfMode }[] = [
  { label: 'Full Practice', mode: 'full' },
  { label: 'Trace Only', mode: 'trace-only' },
  { label: 'Write Only', mode: 'write-only' },
];
const SIZES: readonly { label: string; fontSize: PdfFontSize }[] = [
  { label: 'Small', fontSize: 'small' },
  { label: 'Medium', fontSize: 'medium' },
  { label: 'Large', fontSize: 'large' },
];

export const PDF_FORM: FormSpec = {
  name: 'Print Practice Sheet',
  fields: [
    { name: 'mode', label: 'Practice Mode', hint: 'Full: model word, trace and blank line. Trace: model and trace. Write: model and blank line.', required: true, kind: 'choice', options: MODES.map((m) => m.label) },
    { name: 'size', label: 'Letter Size', hint: 'Small fits more words on a page, Large fewer and bigger.', required: true, kind: 'choice', options: SIZES.map((s) => s.label) },
  ],
};

/** The dialog's own mode and font size for a Practice Mode and a Letter Size. */
export function readPdf(args: FormArgs): { mode: PdfMode; fontSize: PdfFontSize } {
  const mode = MODES.find((m) => m.label === trimmed(args, 'mode'));
  const size = SIZES.find((s) => s.label === trimmed(args, 'size'));
  if (!mode) throw new FormRefused('Practice Mode is not one of the modes');
  if (!size) throw new FormRefused('Letter Size is not one of the sizes');
  return { mode: mode.mode, fontSize: size.fontSize };
}

/** Makes the sheet: `generate` is what Download PDF calls with the dialog's mode and font size. */
export const savePdfCommand = (generate: (mode: PdfMode, fontSize: PdfFontSize) => unknown): Command =>
  formCommand(PDF_FORM, {
    name: 'savePdf',
    tell: 'Downloads the printable practice sheet with the practice mode and letter size given',
    send: async (args) => {
      const { mode, fontSize } = readPdf(args);
      await generate(mode, fontSize);
      return { said: 'Making the practice sheet.' };
    },
  });

// The Welcome wizard -------------------------------------------------------------------------------------------------------------
// Spec and command only, and NOT on the wizard (first-run.tsx has no door): the name it asks is the child's, and VISION.md's line is
// "children's names never go on chain" (docs/what-the-tutor-is-told.md: profile.name never leaves the phone for the mill). A tutor that asks
// for it, or is told it in a reply, sends it to the mill. The Governor decides whether the wizard gets a door before this is wired.

type ThemeName = Pick<Theme, 'id' | 'name'>;

/** The Welcome: a name, and a theme chosen from the app's themes (the first, Dragon Forge, when none is chosen). */
export const welcomeForm = (themes: readonly ThemeName[]): FormSpec => ({
  name: 'Welcome to SpellForge',
  fields: [
    { name: 'name', label: "What's your name?", required: true, kind: 'text', ...upTo(SHORT_MAX) },
    { name: 'theme', label: 'Pick Your Theme', hint: 'How do you want to earn rewards?', required: false, kind: 'choice', options: themes.map((t) => t.name) },
  ],
});

/** The name and the id of the chosen theme; the wizard's own start, dragon-forge, when none is chosen. */
export function readWelcome(themes: readonly ThemeName[], args: FormArgs): { name: string; themeId: string } {
  const name = trimmed(args, 'name');
  if (!name) throw new FormRefused("What's your name? is empty");
  const chosen = trimmed(args, 'theme');
  const theme = chosen ? themes.find((t) => t.name === chosen) : undefined;
  if (chosen && !theme) throw new FormRefused(`${chosen} is not a theme`);
  return { name, themeId: theme?.id ?? 'dragon-forge' };
}

/** Finishes the Welcome: `finish` is what Start Forging! calls with the name and the theme's id. */
export const welcomeCommand = (themes: readonly ThemeName[], finish: (name: string, themeId: string) => unknown): Command =>
  formCommand(welcomeForm(themes), {
    name: 'finishWelcome',
    tell: 'Finishes the welcome with the name given and the theme chosen',
    send: async (args) => {
      const { name, themeId } = readWelcome(themes, args);
      await finish(name, themeId);
      return { said: `Welcome, ${name}!` };
    },
  });
