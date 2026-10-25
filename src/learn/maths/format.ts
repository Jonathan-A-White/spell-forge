// src/learn/maths/format.ts — How the operations and algebra nodes write a number into a problem or an answer (docs/maths-graph.md).
// Problems use the real minus sign, × and ÷; answers stay bare ASCII (`-3`, `3/4`, `0.25`) so `checkAnswer` reads them.

const MINUS = '−';
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** The i-th of a short list, going round again past its end. */
export const cycle = <T>(list: readonly T[], i: number): T => list[i % list.length];

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** A number as a child reads it in a problem: a negative one with the minus sign, `−3`. */
export const neg = (n: number): string => (n < 0 ? `${MINUS}${-n}` : String(n));

/** "+ 3" or "− 3": the sign and size of a number that follows another term, `x + 3` or `x − 3`. */
export const plus = (n: number): string => (n < 0 ? `${MINUS} ${-n}` : `+ ${n}`);

/** A whole number as an exponent: 3 as `³`, 12 as `¹²`. */
export const sup = (n: number): string => [...String(n)].map((d) => SUPERSCRIPT[Number(d)]).join('');

/** A fraction in lowest terms as an answer: `6/8` as `3/4`, `6/3` as `2`. */
export function frac(top: number, bottom: number): string {
  const g = gcd(top, bottom) || 1;
  const [t, b] = [top / g, bottom / g];
  return b === 1 ? String(t) : `${t}/${b}`;
}

/** Tenths as a decimal: 25 as `2.5`. */
export const tenths = (t: number): string => `${Math.floor(t / 10)}.${t % 10}`;

/** Hundredths as a decimal: 12 as `0.12`, 105 as `1.05`. */
export const hundredths = (h: number): string => `${Math.floor(h / 100)}.${String(h % 100).padStart(2, '0')}`;
