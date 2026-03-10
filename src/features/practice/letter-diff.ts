// src/features/practice/letter-diff.ts — Character-level diff for spelling comparison

export interface LetterDiff {
  letter: string;
  status: 'correct' | 'wrong' | 'missing' | 'extra';
}

/**
 * Compute a character-level diff between the user's attempt and the correct word.
 *
 * Uses a simple LCS (longest common subsequence) alignment so that
 * insertions, deletions, and substitutions are all visible.
 */
export function computeLetterDiff(attempt: string, correct: string): { attemptDiff: LetterDiff[]; correctDiff: LetterDiff[] } {
  const a = attempt.toLowerCase();
  const c = correct.toLowerCase();

  // Build LCS table
  const m = a.length;
  const n = c.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === c[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build aligned diffs
  const attemptStack: LetterDiff[] = [];
  const correctStack: LetterDiff[] = [];

  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === c[j - 1]) {
      attemptStack.push({ letter: a[i - 1], status: 'correct' });
      correctStack.push({ letter: c[j - 1], status: 'correct' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Letter in correct but missing from attempt
      correctStack.push({ letter: c[j - 1], status: 'missing' });
      j--;
    } else {
      // Extra letter in attempt
      attemptStack.push({ letter: a[i - 1], status: 'extra' });
      i--;
    }
  }

  // Reverse stacks (we built them backwards)
  const attemptDiff: LetterDiff[] = [];
  const correctDiff: LetterDiff[] = [];

  for (let k = attemptStack.length - 1; k >= 0; k--) {
    attemptDiff.push(attemptStack[k]);
  }
  for (let k = correctStack.length - 1; k >= 0; k--) {
    correctDiff.push(correctStack[k]);
  }

  return { attemptDiff, correctDiff };
}
