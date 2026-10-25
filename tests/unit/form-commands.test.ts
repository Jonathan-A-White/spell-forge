// tests/unit/form-commands.test.ts — the five grown-up forms as the tutor sees them (mw-cb24ai.3): each spec asks for what the
// form gates on, a choice carries the form's own options, and the confirm command calls the one handler the form's Save calls, once,
// with the same values. The commands are run through a registry, as the door runs them, so the schema check is the real one.
import { describe, expect, it, vi } from 'vitest';
import { defineRegistry, type Command } from 'voice-kit/talks';
import { argsOf, requiredFilled, type FormSpec } from 'voice-kit/forms';
import { getAllLanguages } from '../../src/i18n/language-registry';
import { themeEngine } from '../../src/themes/engine';
import {
  LIST_FORM,
  OWN_QUESTION,
  PDF_FORM,
  QUESTIONS,
  QUESTION_FORM,
  questionForm,
  TEST_RESULTS_FORM,
  readGrade,
  readList,
  readPdf,
  readWelcome,
  saveListCommand,
  savePdfCommand,
  saveQuestionCommand,
  saveTestResultsCommand,
  welcomeCommand,
  welcomeForm,
} from '../../src/features/tutor/form-commands';

const registryOf = (command: Command) => defineRegistry({ commands: [command] });
const field = (form: FormSpec, name: string) => {
  const found = form.fields.find((f) => f.name === name);
  if (!found) throw new Error(`no field ${name}`);
  return found;
};
const labels = (form: FormSpec) => form.fields.map((f) => f.label);
const requiredNames = (form: FormSpec) => form.fields.filter((f) => f.required).map((f) => f.name);

describe('Pick a question', () => {
  it('is Question, Write your question and Your answer, asking for the question and the answer', () => {
    expect(QUESTION_FORM.name).toBe('Pick a question');
    expect(labels(QUESTION_FORM)).toEqual(['Question', 'Write your question', 'Your answer']);
    expect(requiredNames(QUESTION_FORM)).toEqual(['question', 'answer']);
    expect(field(QUESTION_FORM, 'question').kind).toBe('choice');
  });

  it('asks for Write your question only once Write your own is the choice', () => {
    expect(requiredNames(questionForm(true))).toEqual(['question', 'own', 'answer']);
    expect(requiredNames(questionForm(false))).toEqual(['question', 'answer']);
  });

  it("carries the form's own questions and Write your own as the options", () => {
    expect(field(QUESTION_FORM, 'question').options).toEqual([...QUESTIONS, OWN_QUESTION]);
  });

  it('is refused without the answer or the question, and with a question that is not one of the options', async () => {
    const save = vi.fn();
    const registry = registryOf(saveQuestionCommand(save));
    expect(registry.refuses('saveQuestion', { question: QUESTIONS[0] })).toMatch(/answer is required/);
    expect(registry.refuses('saveQuestion', { answer: 'Rex' })).toMatch(/question is required/);
    expect(registry.refuses('saveQuestion', { question: 'Is it a secret?', answer: 'Rex' })).toMatch(/question must be one of/);
    expect(save).not.toHaveBeenCalled();
  });

  it('runs the same save as the form, once: a question from the list, then one of his own', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const registry = registryOf(saveQuestionCommand(save));
    const first = await registry.run('saveQuestion', { question: QUESTIONS[1], answer: 'Elm Street' });
    expect(first.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(QUESTIONS[1], 'Elm Street');

    const own = await registry.run('saveQuestion', { question: OWN_QUESTION, own: ' Who is my best friend? ', answer: ' Sam ' });
    expect(own.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('Who is my best friend?', 'Sam');
  });

  it('is refused, and saves nothing, when Write your own is chosen and no question is written', async () => {
    const save = vi.fn();
    const ran = await registryOf(saveQuestionCommand(save)).run('saveQuestion', { question: OWN_QUESTION, answer: 'Sam' });
    expect(ran.ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('takes from the form the same args the door gives (one path)', () => {
    const values = { question: QUESTIONS[0], own: '', answer: ' Rex ' };
    expect(argsOf(QUESTION_FORM, values)).toEqual({ question: QUESTIONS[0], answer: 'Rex' });
    expect(registryOf(saveQuestionCommand(vi.fn())).refuses('saveQuestion', argsOf(QUESTION_FORM, values))).toBeUndefined();
  });
});

describe('New Word List / Edit List', () => {
  it('is List Name, Language, Test Date and Words, asking for the name and the words', () => {
    expect(LIST_FORM.name).toBe('Word list');
    expect(labels(LIST_FORM)).toEqual(['List Name', 'Language', 'Test Date', 'Words']);
    expect(requiredNames(LIST_FORM)).toEqual(['name', 'words']);
  });

  it("carries the app's languages as the Language options, by their display names", () => {
    expect(field(LIST_FORM, 'language').kind).toBe('choice');
    expect(field(LIST_FORM, 'language').options).toEqual(getAllLanguages().map((l) => l.displayName));
  });

  it('keeps all the words in one text field the tutor fills', () => {
    expect(field(LIST_FORM, 'words').kind).toBe('text');
    expect(field(LIST_FORM, 'words').maxLength).toBeGreaterThan(1200);
  });

  it('is refused without a List Name or without Words', () => {
    const registry = registryOf(saveListCommand(vi.fn()));
    expect(registry.refuses('saveList', { words: 'cat' })).toMatch(/name is required/);
    expect(registry.refuses('saveList', { name: 'Week 12' })).toMatch(/words is required/);
    expect(registry.refuses('saveList', { name: 'Week 12', words: 'cat', language: 'Klingon' })).toMatch(/language must be one of/);
  });

  it('is refused, and saves nothing, when the Words hold no word or the Test Date is not a date', async () => {
    const save = vi.fn();
    const registry = registryOf(saveListCommand(save));
    expect((await registry.run('saveList', { name: 'Week 12', words: ' , \n ' })).ok).toBe(false);
    expect((await registry.run('saveList', { name: 'Week 12', words: 'cat', testDate: 'next Friday' })).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("runs the same save as the form, once, with the words as the form's Save splits them", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const registry = registryOf(saveListCommand(save));
    const ran = await registry.run('saveList', { name: ' Week 12 ', language: 'Spanish', testDate: '2026-11-20', words: 'Casa, Montaña\nfamilia\n' });
    expect(ran.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: 'Week 12', words: ['casa', 'montaña', 'familia'], testDate: new Date('2026-11-20'), language: 'es' });
  });

  it('has the form language and no date when they are not given', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await registryOf(saveListCommand(save)).run('saveList', { name: 'Week 1', words: 'cat' });
    expect(save).toHaveBeenCalledWith({ name: 'Week 1', words: ['cat'], testDate: null, language: 'en' });
  });

  it('reads what the form holds into the same list the door sends', () => {
    const values = { name: ' Week 12 ', language: 'English', testDate: '', words: 'Cat\ndog' };
    expect(readList(argsOf(LIST_FORM, values))).toEqual({ name: 'Week 12', words: ['cat', 'dog'], testDate: null, language: 'en' });
    expect(requiredFilled(LIST_FORM, values)).toBe(true);
  });
});

describe('Record Test Results', () => {
  it("takes the grade only: the word marks stay by hand", () => {
    expect(TEST_RESULTS_FORM.name).toBe('Record Test Results');
    expect(TEST_RESULTS_FORM.fields.map((f) => f.name)).toEqual(['grade']);
    expect(requiredNames(TEST_RESULTS_FORM)).toEqual(['grade']);
  });

  it('is refused without a grade, and with one that is not a percent', async () => {
    const save = vi.fn();
    const registry = registryOf(saveTestResultsCommand(save));
    expect(registry.refuses('saveTestResults', {})).toMatch(/grade is required/);
    expect((await registry.run('saveTestResults', { grade: 'A plus' })).ok).toBe(false);
    expect((await registry.run('saveTestResults', { grade: '140' })).ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("runs the same save as the form's Save Results, once, with the grade as the override", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const ran = await registryOf(saveTestResultsCommand(save)).run('saveTestResults', { grade: '85%' });
    expect(ran.ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(85);
    expect(readGrade({ grade: ' 85 ' })).toBe(85);
  });
});

describe('Print Practice Sheet', () => {
  it('is Practice Mode and Letter Size, both asked for', () => {
    expect(PDF_FORM.name).toBe('Print Practice Sheet');
    expect(labels(PDF_FORM)).toEqual(['Practice Mode', 'Letter Size']);
    expect(requiredNames(PDF_FORM)).toEqual(['mode', 'size']);
  });

  it("carries the dialog's own options", () => {
    expect(field(PDF_FORM, 'mode').options).toEqual(['Full Practice', 'Trace Only', 'Write Only']);
    expect(field(PDF_FORM, 'size').options).toEqual(['Small', 'Medium', 'Large']);
  });

  it('is refused with a mode or a size that is not an option, or with one missing', () => {
    const registry = registryOf(savePdfCommand(vi.fn()));
    expect(registry.refuses('savePdf', { mode: 'Full Practice' })).toMatch(/size is required/);
    expect(registry.refuses('savePdf', { mode: 'Colouring', size: 'Large' })).toMatch(/mode must be one of/);
  });

  it("runs the same generate as Download PDF, once, with the dialog's own values", async () => {
    const generate = vi.fn();
    const ran = await registryOf(savePdfCommand(generate)).run('savePdf', { mode: 'Trace Only', size: 'Large' });
    expect(ran.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('trace-only', 'large');
    expect(readPdf({ mode: 'Write Only', size: 'Small' })).toEqual({ mode: 'write-only', fontSize: 'small' });
  });
});

describe('the Welcome wizard', () => {
  const themes = themeEngine.getAllThemes();
  const form = welcomeForm(themes);

  it('asks for a name, and offers the themes as a choice', () => {
    expect(form.name).toBe('Welcome to SpellForge');
    expect(requiredNames(form)).toEqual(['name']);
    expect(field(form, 'theme').kind).toBe('choice');
    expect(field(form, 'theme').options).toEqual(themes.map((t) => t.name));
  });

  it('is refused without a name or with a theme that is not one of the themes', () => {
    const registry = registryOf(welcomeCommand(themes, vi.fn()));
    expect(registry.refuses('finishWelcome', {})).toMatch(/name is required/);
    expect(registry.refuses('finishWelcome', { name: 'Ada', theme: 'Space Pirates' })).toMatch(/theme must be one of/);
  });

  it('is refused, and finishes nothing, for a name of only spaces', async () => {
    const finish = vi.fn();
    expect((await registryOf(welcomeCommand(themes, finish)).run('finishWelcome', { name: '   ' })).ok).toBe(false);
    expect(finish).not.toHaveBeenCalled();
  });

  it("runs the same finish as Start Forging!, once, with the theme's id", async () => {
    const finish = vi.fn();
    const pick = themes[themes.length - 1];
    const ran = await registryOf(welcomeCommand(themes, finish)).run('finishWelcome', { name: ' Ada ', theme: pick.name });
    expect(ran.ok).toBe(true);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith('Ada', pick.id);
  });

  it('keeps the first theme, the form\'s own default, when none is given', async () => {
    const finish = vi.fn();
    await registryOf(welcomeCommand(themes, finish)).run('finishWelcome', { name: 'Ada' });
    expect(finish).toHaveBeenCalledWith('Ada', 'dragon-forge');
    expect(readWelcome(themes, { name: ' Ada ' })).toEqual({ name: 'Ada', themeId: 'dragon-forge' });
  });
});

describe('every command', () => {
  const commands: Command[] = [
    saveQuestionCommand(vi.fn()),
    saveListCommand(vi.fn()),
    saveTestResultsCommand(vi.fn()),
    savePdfCommand(vi.fn()),
    welcomeCommand(themeEngine.getAllThemes(), vi.fn()),
  ];

  it('is a confirm command with a name of its own', () => {
    expect(commands.map((c) => c.kind)).toEqual(['confirm', 'confirm', 'confirm', 'confirm', 'confirm']);
    expect(new Set(commands.map((c) => c.name)).size).toBe(5);
    expect(() => defineRegistry({ commands })).not.toThrow();
  });
});
