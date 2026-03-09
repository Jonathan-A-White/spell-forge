// src/features/practice/spelling-quiz.tsx — Spelling quiz with pass/fail scoring

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { shuffle } from '../../core/shuffle';

interface SpellingQuizProps {
  words: string[];
  onComplete: (results: QuizResults) => void;
  onSpeak?: (word: string) => void;
  audioBusy?: boolean;
  tapTargetSize: number;
  savedState?: QuizSavedState;
  onProgress?: (state: QuizSavedState) => void;
}

export interface QuizResults {
  totalQuestions: number;
  correctAnswers: number;
  percentage: number;
  passed: boolean;
  answers: QuizAnswer[];
}

interface QuizAnswer {
  word: string;
  userAnswer: string;
  correct: boolean;
  questionType: QuestionType;
}

type QuestionType = 'fill-blank' | 'multiple-choice' | 'unscramble';

const PASS_THRESHOLD = 85;

interface QuizQuestion {
  word: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  scrambled?: string;
}

export interface QuizSavedState {
  questions: QuizQuestion[];
  currentIndex: number;
  answers: QuizAnswer[];
}

function scrambleWord(word: string): string {
  const letters = word.split('');
  let scrambled: string;
  let attempts = 0;
  do {
    scrambled = shuffle(letters).join('');
    attempts++;
  } while (scrambled === word && attempts < 10);
  return scrambled;
}

function generateMisspellings(word: string): string[] {
  const misspellings: string[] = [];
  const lower = word.toLowerCase();

  // Double a letter
  if (lower.length >= 3) {
    const idx = Math.floor(Math.random() * (lower.length - 1)) + 1;
    misspellings.push(lower.slice(0, idx) + lower[idx] + lower.slice(idx));
  }

  // Swap two adjacent letters
  if (lower.length >= 2) {
    const idx = Math.floor(Math.random() * (lower.length - 1));
    const arr = lower.split('');
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    const swapped = arr.join('');
    if (swapped !== lower) misspellings.push(swapped);
  }

  // Remove a letter
  if (lower.length >= 3) {
    const idx = Math.floor(Math.random() * lower.length);
    misspellings.push(lower.slice(0, idx) + lower.slice(idx + 1));
  }

  // Change a vowel
  const vowels = 'aeiou';
  const vowelIdx = [...lower].findIndex((ch) => vowels.includes(ch));
  if (vowelIdx >= 0) {
    const otherVowels = vowels.replace(lower[vowelIdx], '');
    const newVowel = otherVowels[Math.floor(Math.random() * otherVowels.length)];
    misspellings.push(lower.slice(0, vowelIdx) + newVowel + lower.slice(vowelIdx + 1));
  }

  // Filter out duplicates and the correct spelling
  return [...new Set(misspellings)].filter((m) => m !== lower);
}

function buildQuestions(words: string[]): QuizQuestion[] {
  const types: QuestionType[] = ['fill-blank', 'multiple-choice', 'unscramble'];

  return shuffle(words).map((word, i) => {
    const type = types[i % types.length];
    const lower = word.toLowerCase();

    switch (type) {
      case 'multiple-choice': {
        const misspellings = generateMisspellings(word);
        const wrongOptions = misspellings.slice(0, 3);
        // Ensure we have at least 3 wrong options
        while (wrongOptions.length < 3) {
          wrongOptions.push(scrambleWord(lower));
        }
        const options = shuffle([lower, ...wrongOptions.slice(0, 3)]);
        return {
          word,
          type,
          prompt: `Choose the correct spelling:`,
          options,
        };
      }
      case 'unscramble': {
        return {
          word,
          type,
          prompt: `Unscramble the letters to spell the word:`,
          scrambled: scrambleWord(lower),
        };
      }
      case 'fill-blank':
      default: {
        return {
          word,
          type,
          prompt: `Type the correct spelling:`,
        };
      }
    }
  });
}

export function SpellingQuiz({ words, onComplete, onSpeak, audioBusy, tapTargetSize, savedState, onProgress }: SpellingQuizProps) {
  const questions = useMemo(() => {
    if (savedState) return savedState.questions;
    return buildQuestions(words);
  }, [words, savedState]);

  const [currentIndex, setCurrentIndex] = useState(savedState?.currentIndex ?? 0);
  const [answers, setAnswers] = useState<QuizAnswer[]>(savedState?.answers ?? []);
  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);

  // Report progress when answers change
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  useEffect(() => {
    if (answers.length > 0) {
      onProgressRef.current?.({
        questions,
        currentIndex,
        answers,
      });
    }
  }, [answers, currentIndex, questions]);

  const currentQuestion = questions[currentIndex] ?? null;
  const isFinished = currentIndex >= questions.length;

  const results = useMemo<QuizResults | null>(() => {
    if (!isFinished) return null;
    const correctCount = answers.filter((a) => a.correct).length;
    const percentage = Math.round((correctCount / answers.length) * 100);
    return {
      totalQuestions: answers.length,
      correctAnswers: correctCount,
      percentage,
      passed: percentage >= PASS_THRESHOLD,
      answers,
    };
  }, [isFinished, answers]);

  const handleSubmit = useCallback(() => {
    if (!currentQuestion || showFeedback) return;

    let userAnswer: string;
    let correct: boolean;

    if (currentQuestion.type === 'multiple-choice') {
      if (!selectedOption) return;
      userAnswer = selectedOption;
      correct = selectedOption === currentQuestion.word.toLowerCase();
    } else {
      userAnswer = inputValue.trim().toLowerCase();
      correct = userAnswer === currentQuestion.word.toLowerCase();
    }

    setLastCorrect(correct);
    setShowFeedback(true);

    setAnswers((prev) => [
      ...prev,
      {
        word: currentQuestion.word,
        userAnswer,
        correct,
        questionType: currentQuestion.type,
      },
    ]);
  }, [currentQuestion, inputValue, selectedOption, showFeedback]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setInputValue('');
    setSelectedOption(null);
    setShowFeedback(false);
    setLastCorrect(false);
  }, []);

  const handleFinish = useCallback(() => {
    if (results) {
      onComplete(results);
    }
  }, [results, onComplete]);

  const buttonSize = `${tapTargetSize}px`;

  // Results screen
  if (isFinished && results) {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-sf-heading">Quiz Results</h2>

        <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 ${
          results.passed
            ? 'border-green-500 bg-green-50'
            : 'border-red-400 bg-red-50'
        }`}>
          <span className={`text-3xl font-bold ${results.passed ? 'text-green-700' : 'text-red-600'}`}>
            {results.percentage}%
          </span>
        </div>

        <div className="text-center">
          {results.passed ? (
            <>
              <p className="text-xl font-bold text-green-700">You Passed!</p>
              <p className="text-sf-muted text-sm mt-1">
                {results.correctAnswers} out of {results.totalQuestions} correct
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-red-600">Keep Practicing!</p>
              <p className="text-sf-muted text-sm mt-1">
                {results.correctAnswers} out of {results.totalQuestions} correct.
                You need {PASS_THRESHOLD}% to pass.
              </p>
            </>
          )}
        </div>

        {/* Answer breakdown */}
        <div className="w-full space-y-2">
          <h3 className="font-bold text-sf-heading text-sm">Answer Breakdown:</h3>
          {results.answers.map((answer, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                answer.correct
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div>
                <p className={`font-medium ${answer.correct ? 'text-green-800' : 'text-red-800'}`}>
                  {answer.word}
                </p>
                {!answer.correct && (
                  <p className="text-xs text-red-600">
                    Your answer: {answer.userAnswer}
                  </p>
                )}
              </div>
              <span className="text-lg">{answer.correct ? '\u2713' : '\u2717'}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleFinish}
          className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          Done
        </button>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progress = Math.round(((currentIndex) / questions.length) * 100);

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto w-full">
      <h2 className="text-xl font-bold text-sf-heading">Spelling Quiz</h2>

      {/* Progress */}
      <div className="w-full">
        <div className="flex justify-between text-sm text-sf-muted mb-1">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-sf-track rounded-full h-2">
          <div
            className="bg-sf-track-fill h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Hear the word button */}
      {onSpeak && (currentQuestion.type === 'fill-blank' || currentQuestion.type === 'unscramble') && (
        <button
          onClick={() => onSpeak(currentQuestion.word)}
          disabled={audioBusy}
          className={`font-bold text-lg transition-colors ${
            audioBusy
              ? 'opacity-50 cursor-not-allowed text-sf-muted'
              : 'text-sf-heading hover:text-sf-text'
          }`}
          aria-label={`Hear the word`}
        >
          Hear the word
        </button>
      )}

      {/* Question */}
      <div className="w-full text-center">
        <p className="text-sf-text font-medium mb-4">{currentQuestion.prompt}</p>

        {currentQuestion.type === 'unscramble' && (
          <div className="flex justify-center gap-2 mb-4">
            {currentQuestion.scrambled!.split('').map((letter, i) => (
              <span
                key={i}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-sf-surface border-2 border-sf-border-strong font-bold uppercase text-sf-heading"
              >
                {letter}
              </span>
            ))}
          </div>
        )}

        {currentQuestion.type === 'multiple-choice' && currentQuestion.options && (
          <div className="space-y-2 w-full">
            {currentQuestion.options.map((option) => {
              let optionStyle = 'bg-sf-surface border-sf-border hover:border-sf-primary';
              if (showFeedback) {
                if (option === currentQuestion.word.toLowerCase()) {
                  optionStyle = 'bg-green-100 border-green-500';
                } else if (option === selectedOption && !lastCorrect) {
                  optionStyle = 'bg-red-100 border-red-400';
                }
              } else if (option === selectedOption) {
                optionStyle = 'bg-sf-primary/20 border-sf-primary';
              }

              return (
                <button
                  key={option}
                  onClick={() => !showFeedback && setSelectedOption(option)}
                  disabled={showFeedback}
                  className={`w-full p-3 rounded-xl border-2 font-medium text-left transition-all ${optionStyle}`}
                  style={{ minHeight: buttonSize }}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {(currentQuestion.type === 'fill-blank' || currentQuestion.type === 'unscramble') && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (showFeedback) handleNext();
                else handleSubmit();
              }
            }}
            disabled={showFeedback}
            placeholder="Type your answer..."
            className="w-full p-3 rounded-xl border-2 border-sf-border-strong bg-sf-surface text-sf-heading font-medium text-center text-lg focus:outline-none focus:ring-2 focus:ring-sf-primary/50"
            style={{ minHeight: buttonSize }}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        )}
      </div>

      {/* Feedback */}
      {showFeedback && (
        <div className={`w-full p-3 rounded-xl text-center font-medium ${
          lastCorrect
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {lastCorrect
            ? 'Correct!'
            : `Not quite. The correct spelling is "${currentQuestion.word.toLowerCase()}".`
          }
        </div>
      )}

      {/* Action buttons */}
      {!showFeedback ? (
        <button
          onClick={handleSubmit}
          disabled={
            (currentQuestion.type === 'multiple-choice' && !selectedOption) ||
            ((currentQuestion.type === 'fill-blank' || currentQuestion.type === 'unscramble') && !inputValue.trim())
          }
          className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: buttonSize }}
        >
          Submit
        </button>
      ) : (
        <button
          onClick={handleNext}
          className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: buttonSize }}
        >
          {currentIndex + 1 < questions.length ? 'Next Question' : 'See Results'}
        </button>
      )}
    </div>
  );
}
