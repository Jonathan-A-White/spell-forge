// tests/unit/form-door.test.tsx — 'Let the tutor do it' on two grown-up forms (mw-cb24ai.3): the list editor and the PIN's Pick a
// question. The tutor is faked (voice-kit's scripted grind and talk store); the door asks one question at a time, fills the fields he
// can see, and ends with Send, which runs the form's own Save: the handler is called once, with what the form holds. A form with no
// tutor given has no door, and the hand path is the one the forms' own tests hold.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFakeGrind, createFakeTalkStore } from 'voice-kit/testing/talks';
import { FORM_START } from 'voice-kit/forms';
import type { Word, WordList } from '../../src/contracts/types';
import { themeEngine } from '../../src/themes/engine';
import { FirstRun } from '../../src/features/onboarding/first-run';
import { PdfExportDialog } from '../../src/features/word-lists/pdf-export-dialog';
import { RecordTestResults } from '../../src/features/word-lists/record-test-results';
import { ListEditor } from '../../src/features/word-lists/list-editor';
import { ParentGate } from '../../src/features/tutor/parent-gate';
import { PARENT_PIN_STORAGE_KEY, getRecoveryQuestion, hasParentPin } from '../../src/features/tutor/parent-pin';
import { QUESTIONS } from '../../src/features/tutor/form-commands';
import { START_LABEL, type FormTalkAnswer, type FormTalkRequest } from '../../src/features/tutor/form-door';
import { setLicenceStatus } from '../../src/shell/licence-gate';

const pdf = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../../src/features/word-lists/pdf-generator', () => ({ downloadWordListPdf: pdf.download }));

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

type Script = (FormTalkAnswer | Error | ((request: FormTalkRequest) => FormTalkAnswer))[];

/** A tutor that answers the script in order and records each request. */
function fakeTutor(script: Script) {
  const grind = createFakeGrind<FormTalkRequest, FormTalkAnswer>(script);
  return { grind, tutor: { send: grind.send, store: createFakeTalkStore() } };
}

/** Says `text` to the tutor: types it in the composer's box and taps Reply. */
async function say(text: string) {
  const typeInstead = screen.queryByRole('button', { name: 'Type a reply' });
  if (typeInstead) fireEvent.click(typeInstead);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your reply' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
}

// the editor's labels are not tied to their fields, so the fields are found as they are drawn
const nameField = () => screen.getByPlaceholderText('e.g., Week 12') as HTMLInputElement;
const wordsField = () => document.querySelector('textarea') as HTMLTextAreaElement;
const dateField = () => document.querySelector('input[type="date"]') as HTMLInputElement;
const tutorLine = () => screen.getByTestId('form-door-say').textContent;

describe('the door on the list editor', () => {
  const editor = (tutor: ReturnType<typeof fakeTutor>['tutor'] | undefined, onSave = vi.fn()) => {
    render(<ListEditor existingWords={[]} onSave={onSave} onCancel={() => undefined} tutor={tutor} />);
    return onSave;
  };

  it('has no door when no tutor is given, and the hand path is as it was', () => {
    const onSave = editor(undefined);
    expect(screen.queryByRole('button', { name: START_LABEL })).toBeNull();
    fireEvent.change(nameField(), { target: { value: 'Week 3' } });
    fireEvent.change(wordsField(), { target: { value: 'Cat, dog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Week 3', ['cat', 'dog'], null, undefined, 'en');
  });

  it('asks one question at a time, fills the fields he can see, and ends with Send, which runs the form\'s own Save', async () => {
    const { grind, tutor } = fakeTutor([
      { words: 'What is the list called?', form_ask: 'name' },
      { words: 'Which words are on it?', form_values: [{ field: 'name', value: 'Week 12' }], form_ask: 'words' },
      { words: 'Everything required is filled in. Read the form, change anything, then tap Send yourself.', form_values: [{ field: 'words', value: 'knight\nbridge, Light' }] },
    ]);
    const onSave = editor(tutor);

    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(tutorLine()).toBe('What is the list called?'));
    // the first request is the form as the tutor sees it, and what he says first
    expect(grind.calls).toHaveLength(1);
    const first = grind.calls[0].request;
    expect(first.message).toBe(FORM_START);
    expect(first.form.name).toBe('Word list');
    expect(first.form.command).toBe('saveList');
    expect(first.form.fields.map((f) => f.label)).toEqual(['List Name', 'Language', 'Test Date', 'Words']);
    expect(first.form.fields.find((f) => f.name === 'language')?.options).toEqual(['English', 'Spanish']);
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    await say('Week twelve');
    await waitFor(() => expect((nameField() as HTMLInputElement).value).toBe('Week 12'));
    expect(tutorLine()).toBe('Which words are on it?');
    expect(grind.calls[1].request.message).toBe('Week twelve');
    // the second request shows what the first filled in
    expect(grind.calls[1].request.form.fields.find((f) => f.name === 'name')?.value).toBe('');
    expect(onSave).not.toHaveBeenCalled();

    await say('knight bridge light');
    await waitFor(() => expect((wordsField() as HTMLTextAreaElement).value).toBe('knight\nbridge, Light'));
    expect(grind.calls[2].request.form.fields.find((f) => f.name === 'name')?.value).toBe('Week 12');
    // the tutor never sends: the form has not been saved
    expect(onSave).not.toHaveBeenCalled();

    const send = await screen.findByRole('button', { name: 'Send' });
    fireEvent.click(send);
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // the very call the form's own Save makes with the same fields
    expect(onSave).toHaveBeenCalledWith('Week 12', ['knight', 'bridge', 'light'], null, undefined, 'en');
    // it has gone: the panel says so and offers no second Send
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('fills a choice only with one of its options, and a field the form does not have not at all', async () => {
    const { tutor } = fakeTutor([
      {
        words: 'Anything else?',
        form_values: [
          { field: 'language', value: 'Klingon' },
          { field: 'nickname', value: 'x' },
          { field: 'name', value: 'Semana 4' },
        ],
      },
      { words: 'Ready.', form_values: [{ field: 'language', value: 'Spanish' }, { field: 'testDate', value: '2026-11-20' }, { field: 'words', value: 'casa' }] },
    ]);
    const onSave = editor(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect((nameField() as HTMLInputElement).value).toBe('Semana 4'));
    expect(screen.getByRole('button', { name: /^English/ }).className).toMatch(/bg-sf-primary/);

    await say('Spanish, on the twentieth, casa');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Spanish/ }).className).toMatch(/bg-sf-primary/));
    expect((dateField() as HTMLInputElement).value).toBe('2026-11-20');
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('Semana 4', ['casa'], new Date('2026-11-20'), undefined, 'es');
  });

  it('says so, and stays open to try again, when the tutor cannot answer', async () => {
    const { grind, tutor } = fakeTutor([new Error('offline'), { words: 'What is the list called?', form_ask: 'name' }]);
    editor(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not answer/i);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(tutorLine()).toBe('What is the list called?'));
    expect(grind.calls).toHaveLength(2);
    expect(grind.calls[1].request.message).toBe(FORM_START);
  });

  it('asks nothing of the tutor while the licence is out, and says why', async () => {
    setLicenceStatus({ state: 'none', checkedAt: Date.now() } as never);
    const { grind, tutor } = fakeTutor([]);
    editor(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    expect((await screen.findByRole('status')).textContent).toMatch(/tutor is asleep/i);
    expect(grind.calls).toHaveLength(0);
  });

  it('puts a refused Send on the screen and saves nothing', async () => {
    // Words is filled with only separators: the schema accepts it, the reader refuses it
    const { tutor } = fakeTutor([{ words: 'Ready.', form_values: [{ field: 'name', value: 'Week 1' }, { field: 'words', value: ' , ' }] }]);
    const onSave = editor(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect((nameField() as HTMLInputElement).value).toBe('Week 1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Words has no word/);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('the door on Pick a question', () => {
  beforeEach(() => localStorage.clear());

  /** Opens the gate for the first time and chooses the PIN, up to Pick a question. */
  async function toPickAQuestion(tutor: ReturnType<typeof fakeTutor>['tutor'] | undefined) {
    render(<ParentGate profileId="p1" onExit={() => undefined} tutor={tutor} />);
    const type = (digits: string) => {
      for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
    };
    type('1234');
    await screen.findByRole('heading', { name: 'Type it again' });
    type('1234');
    await screen.findByRole('heading', { name: 'Pick a question' });
  }

  it('has no door when no tutor is given', async () => {
    await toPickAQuestion(undefined);
    expect(screen.queryByRole('button', { name: START_LABEL })).toBeNull();
  });

  it("asks, fills Question and Your answer, and ends with Send, which saves the question as Save does", async () => {
    const { grind, tutor } = fakeTutor([
      { words: 'Which question will help you remember?', form_ask: 'question' },
      { words: 'What is the answer to it?', form_values: [{ field: 'question', value: QUESTIONS[2] }], form_ask: 'answer' },
      { words: 'Everything required is filled in. Read the form, then tap Send yourself.', form_values: [{ field: 'answer', value: 'Pasta' }] },
    ]);
    await toPickAQuestion(tutor);

    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(tutorLine()).toBe('Which question will help you remember?'));
    const first = grind.calls[0].request;
    expect(first.form.name).toBe('Pick a question');
    expect(first.form.fields.map((f) => f.label)).toEqual(['Question', 'Write your question', 'Your answer']);
    expect(first.form.fields[0].options).toContain('Write your own');
    // the select opens on the first question, which is not yet a choice
    expect(first.form.fields.map((f) => f.value)).toEqual(['', '', '']);

    await say('the favourite meal one');
    await waitFor(() => expect((screen.getByLabelText('Question') as HTMLSelectElement).value).toBe(QUESTIONS[2]));
    await say('pasta');
    await waitFor(() => expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('Pasta'));
    // nothing is saved until he taps Send
    expect(hasParentPin()).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(hasParentPin()).toBe(true));
    expect(getRecoveryQuestion()).toBe(QUESTIONS[2]);
    expect(localStorage.getItem(PARENT_PIN_STORAGE_KEY)).not.toContain('Pasta');
  });

  it('asks for Write your question only when he chose to write his own', async () => {
    const { grind, tutor } = fakeTutor([
      { words: 'Which question?', form_values: [{ field: 'question', value: 'Write your own' }], form_ask: 'own' },
      { words: 'And the answer?', form_values: [{ field: 'own', value: 'Who is my best friend?' }], form_ask: 'answer' },
      { words: 'Ready.', form_values: [{ field: 'answer', value: 'Sam' }] },
    ]);
    await toPickAQuestion(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(screen.getByLabelText('Write your question')).toBeTruthy());
    const required = (call: number) => grind.calls[call].request.form.fields.filter((f) => f.required).map((f) => f.name);
    expect(required(0)).toEqual(['question', 'answer']);

    await say('my own');
    await waitFor(() => expect((screen.getByLabelText('Write your question') as HTMLInputElement).value).toBe('Who is my best friend?'));
    expect(required(1)).toEqual(['question', 'own', 'answer']);
    await say('Sam');
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(hasParentPin()).toBe(true));
    expect(getRecoveryQuestion()).toBe('Who is my best friend?');
  });

  it('keeps the door out of the way of the Save button, which is still the form\'s own', async () => {
    const { tutor } = fakeTutor([{ words: 'Which question?', form_ask: 'question' }]);
    await toPickAQuestion(tutor);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(tutorLine()).toBe('Which question?'));
    // the tutor's panel has a Send only once the form can go; Save is the form's own and waits for an answer
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the door on the other three forms', () => {
  it('Print Practice Sheet: fills Practice Mode and Letter Size, and Send downloads as Download PDF does', async () => {
    const { grind, tutor } = fakeTutor([
      { words: 'Which sheet do you want?', form_values: [{ field: 'mode', value: 'Trace Only' }, { field: 'size', value: 'Giant' }], form_ask: 'size' },
      { words: 'Ready.', form_values: [{ field: 'size', value: 'Large' }] },
    ]);
    render(<PdfExportDialog listName="Week 1" words={['cat', 'dog']} onClose={() => undefined} tutor={tutor} />);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect((screen.getByRole('radio', { name: /Trace Only/ }) as HTMLInputElement).checked).toBe(true));
    expect(grind.calls[0].request.form.fields.map((f) => f.label)).toEqual(['Practice Mode', 'Letter Size']);
    // the dialog opens on Full Practice and Medium, which are not choices yet: the tutor is told both are empty
    expect(grind.calls[0].request.form.fields.map((f) => f.value)).toEqual(['', '']);
    // a size that is not one of the options is not taken
    expect(screen.getByRole('button', { name: /^Medium/ }).className).toMatch(/border-sf-primary/);

    await say('large please');
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(pdf.download).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(pdf.download).toHaveBeenCalledWith({ mode: 'trace-only', fontSize: 'large', listName: 'Week 1', words: ['cat', 'dog'] });
  });

  it('Record Test Results: the tutor takes the grade, the marks stay by hand, and Send saves as Save Results does', async () => {
    const list = { id: 'l1', name: 'Week 1' } as WordList;
    const words = [{ id: 'w1', text: 'cat' }, { id: 'w2', text: 'dog' }] as Word[];
    const onSave = vi.fn();
    const { grind, tutor } = fakeTutor([{ words: 'What grade did the teacher give?', form_ask: 'grade' }, { words: 'Ready.', form_values: [{ field: 'grade', value: '85%' }] }]);
    render(<RecordTestResults list={list} words={words} onSave={onSave} onCancel={() => undefined} tutor={tutor} />);
    fireEvent.click(screen.getByTestId('word-result-w1')); // the first word marked correct, by hand
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(tutorLine()).toBe('What grade did the teacher give?'));
    expect(grind.calls[0].request.form.fields.map((f) => f.name)).toEqual(['grade']);
    await say('eighty five');
    await waitFor(() => expect((screen.getByPlaceholderText('Enter %') as HTMLInputElement).value).toBe('85'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      [{ wordId: 'w1', word: 'cat', correct: true }, { wordId: 'w2', word: 'dog', correct: false }],
      85,
    );
  });

  it('the Welcome wizard: the tutor asks the name and the theme, the panel stays open into step two, and Send starts forging', async () => {
    const themes = themeEngine.getAllThemes();
    const pick = themes[themes.length - 1];
    const onComplete = vi.fn();
    const { grind, tutor } = fakeTutor([
      { words: 'What is your name?', form_ask: 'name' },
      { words: 'Everything required is filled in. You can also pick a theme.', form_values: [{ field: 'name', value: 'Ada' }, { field: 'theme', value: pick.name }] },
    ]);
    render(<FirstRun onComplete={onComplete} tutor={tutor} />);
    fireEvent.click(screen.getByRole('button', { name: START_LABEL }));
    await waitFor(() => expect(tutorLine()).toBe('What is your name?'));
    expect(grind.calls[0].request.form.fields.find((f) => f.name === 'theme')?.options).toEqual(themes.map((t) => t.name));

    await say('Ada, and the last theme');
    await waitFor(() => expect((screen.getByPlaceholderText('Enter your name') as HTMLInputElement).value).toBe('Ada'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Pick Your Theme, Ada!' });
    // the same panel, not a new one, with the theme the tutor chose shown as chosen
    expect(tutorLine()).toMatch(/pick a theme/);
    expect(screen.getByText(pick.name).closest('button')?.className).toMatch(/border-sf-primary/);

    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith('Ada', pick.id, expect.objectContaining({}));
  });
});
