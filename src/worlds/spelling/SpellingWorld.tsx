// src/worlds/spelling/SpellingWorld.tsx — The Spelling world (Kestrel 15c): hosts the flow's turns one at a time. A placement turn is a word to
// hear and two spellings to pick, so the child never has to type; a drill turn is a node's words opened as one of the games (drill-forms.ts, 15a)
// with the node's mnemonic picture beside it when one is kept (src/learn/mnemonic-pictures.ts, 15b: a picture is decoration, never needed). The
// world tells the tutor where the child is through useReportScreen (M37: the node, never the words) and runs its one timer through the shell's
// visible-interval helper (M10). What is asked, and how a turn counts, is spelling-flow.ts's; this draws it. A miss is met with the word and a
// way on, never a dead end.
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { mnemonicPicture, type MnemonicNode } from '../../learn/mnemonic-pictures';
import { useReportScreen } from '../../shell/report-screen';
import { useVisibleInterval } from '../../shell/visible-interval';
import { openGame as openDrillGame, type DrillFormId, type GameContext, type GameItem } from './drill-forms';
import { createSpellingFlow, storageGraphStore, storageKeep, type SpellingAnswer, type SpellingFlow, type SpellingResult, type SpellingTurn } from './spelling-flow';
import { IDLE_LOOK_MS, SPELLING_SCREEN_NAME, screenFacts } from './spelling-report';

export interface SpellingWorldProps {
  /** The flow to take turns of; one over the child's own place on the phone when absent (needs `profileId`). */
  flow?: SpellingFlow;
  profileId?: string;
  /** The ids of the spelling-graph nodes the child's word lists practise, asked before the frontier (spelling-flow.ts's `focus`). */
  focus?: () => Promise<readonly string[]>;
  /** Says a word aloud; the placement asks for it. */
  onSpeak?: (word: string) => void;
  audioBusy?: boolean;
  /** The picture for a node, or undefined when there is none to show: the picture module's when absent. */
  picture?: (node: MnemonicNode) => Promise<string | undefined>;
  /** Opens a game form with a node's words: drill-forms.ts's when absent. */
  openGame?: (form: string, items: readonly GameItem[], ctx: GameContext) => ReactElement;
  tapTargetSize?: number;
  themeId?: string;
  onBack?: () => void;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

const BUTTON = 'px-5 rounded-xl font-bold active:scale-[0.97] transition-transform';
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-text`;

const DEFAULT_TAP_TARGET = 48;

/** A turn's form is one of drill-forms.ts's by the flow's making. */
const openForm = (form: string, items: readonly GameItem[], ctx: GameContext): ReactElement => openDrillGame(form as DrillFormId, items, ctx);

/** The two spellings of a placement turn in an order that is the turn's own, so a redraw keeps it. */
function pickOrder(turn: SpellingTurn): string[] {
  const { word, distractor } = turn.items[0];
  const odd = [...turn.key].reduce((total, ch) => total + ch.charCodeAt(0), 0) % 2 === 1;
  return odd ? [distractor, word] : [word, distractor];
}

export function SpellingWorld({ flow: given, profileId, focus, onSpeak, audioBusy, picture = mnemonicPicture, openGame = openForm, tapTargetSize = DEFAULT_TAP_TARGET, themeId, onBack }: SpellingWorldProps) {
  const flow = useMemo(
    () => given ?? createSpellingFlow({ store: storageGraphStore(profileId ?? 'learner'), keep: storageKeep(profileId ?? 'learner'), focus }),
    // focus reads the lists when it is called, so a new closure each render must not start the flow again
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given, profileId],
  );
  const [round, setRound] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [turn, setTurn] = useState<SpellingTurn | null>(null);
  const [result, setResult] = useState<{ answer: SpellingAnswer; picked?: string } | null>(null);
  const [drawing, setDrawing] = useState<{ key: string; svg: string } | null>(null);

  useEffect(() => {
    let current = true;
    void flow.question().then((next) => {
      if (!current) return;
      setTurn(next);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [flow, round]);

  // The node's picture sits beside its drill; the placement shows none, and a picture that cannot be had is no picture.
  const pictureKey = turn && turn.stage !== 'placement' ? turn.key : null;
  const latestPicture = useRef(picture);
  const latestSpeak = useRef(onSpeak);
  useEffect(() => {
    latestPicture.current = picture;
    latestSpeak.current = onSpeak;
  });
  useEffect(() => {
    if (!turn || pictureKey === null) return;
    let current = true;
    const node: MnemonicNode = { id: turn.nodeId, name: turn.nodeName, words: turn.items.map((i) => i.word) };
    void Promise.resolve()
      .then(() => latestPicture.current(node))
      .catch(() => undefined)
      .then((svg) => {
        if (current && svg) setDrawing({ key: pictureKey, svg });
      });
    return () => {
      current = false;
    };
  }, [turn, pictureKey]);

  // A placement word is said as the question arrives.
  const placementKey = turn?.stage === 'placement' ? turn.key : null;
  useEffect(() => {
    if (turn && placementKey !== null) latestSpeak.current?.(turn.items[0].word);
  }, [turn, placementKey]);

  useReportScreen(SPELLING_SCREEN_NAME, useMemo(() => screenFacts(loaded ? turn : null), [loaded, turn]));

  // With nothing to ask, look again now and then: a review comes due while the page is open. A turn showing needs no timer.
  useVisibleInterval(() => setRound((r) => r + 1), loaded && turn === null ? IDLE_LOOK_MS : null);

  const finish = async (outcome: SpellingResult, picked?: string) => {
    if (!turn || result) return;
    setResult({ answer: await flow.answer(outcome), picked });
  };

  const next = () => {
    setResult(null);
    setTurn(null);
    setDrawing(null);
    setLoaded(false);
    setRound((r) => r + 1);
  };

  const gameContext: GameContext = {
    tapTargetSize,
    onComplete: (outcome) => void finish(outcome),
    onSpeak,
    audioBusy,
    themeId,
  };
  const showing = turn && drawing && drawing.key === turn.key ? drawing.svg : null;

  return (
    <div className="min-h-screen bg-sf-bg p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          {onBack && (
            <button onClick={onBack} style={TAP} className="px-3 -ml-3 rounded-lg text-sf-muted hover:text-sf-secondary" aria-label="Go back">
              &larr;
            </button>
          )}
          <h1 className="text-sf-heading text-xl font-bold">{SPELLING_SCREEN_NAME}</h1>
        </div>

        {!loaded && <p className="text-sf-muted">One moment...</p>}

        {loaded && turn === null && (
          <p role="status" className="text-sf-text text-lg">
            All done for today. Come back later for more.
          </p>
        )}

        {turn && (
          <div className="flex flex-col gap-4">
            {turn.stage === 'placement' && (
              <p className="text-sf-muted text-sm">Let&apos;s see what you know. Listen, then tap the way the word is spelt.</p>
            )}
            <div className="flex items-center gap-3">
              {showing && (
                <img
                  data-testid="mnemonic-picture"
                  alt=""
                  aria-hidden="true"
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(showing)}`}
                  className="w-24 h-24 shrink-0 rounded-xl bg-sf-surface"
                />
              )}
              <p className="text-sf-muted text-sm">{turn.nodeName}</p>
            </div>

            {turn.stage === 'placement' ? (
              <Pick turn={turn} result={result} onHear={() => onSpeak?.(turn.items[0].word)} onPick={(spelling) => void finish({ correct: spelling === turn.items[0].word ? 1 : 0, total: 1 }, spelling)} />
            ) : (
              !result && <div key={turn.key}>{openGame(turn.form, turn.items, gameContext)}</div>
            )}

            {result && (
              <>
                <Feedback turn={turn} result={result} />
                <button type="button" onClick={next} style={TAP} className={`${BUTTON} bg-sf-primary text-sf-primary-text`}>
                  Next
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Pick({ turn, result, onHear, onPick }: { turn: SpellingTurn; result: unknown; onHear: () => void; onPick: (spelling: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onHear} style={TAP} className={SECONDARY}>
        Hear the word
      </button>
      <div className="flex flex-wrap gap-2">
        {pickOrder(turn).map((spelling) => (
          <button key={spelling} type="button" disabled={result !== null} onClick={() => onPick(spelling)} style={TAP} className={`${BUTTON} bg-sf-primary text-sf-primary-text disabled:opacity-60 text-xl`}>
            {spelling}
          </button>
        ))}
      </div>
    </div>
  );
}

function Feedback({ turn, result }: { turn: SpellingTurn; result: { answer: SpellingAnswer } }) {
  const { answer } = result;
  let line: string;
  if (turn.stage === 'placement') line = answer.counted ? 'Right! Well done.' : `Not quite yet. It is spelt ${turn.items[0].word}.`;
  else if (answer.counted) line = answer.solid ? 'All right! You have got this one.' : 'All right! Well done.';
  else line = `You spelt ${answer.correct} of ${answer.total} right. That's okay, we will come back to these.`;
  return (
    <p role="status" className="text-sf-text text-lg">
      {line}
    </p>
  );
}
