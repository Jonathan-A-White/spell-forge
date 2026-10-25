// src/learn/svg-rules.ts — Lampas's rules for a memory picture (its docs/pictures.md and tests/unit/pictures.test.ts),
// ported so the app can hold an SVG a grind drew to them: one svg on the 96 grid under 2.5 KB, with no text, image,
// script, href or data URI. Beyond Lampas's list it refuses a foreignObject and an on* handler, because this picture
// comes from the mill and not from a hand. Pure code over the DOMParser the browser (and jsdom) has.

export const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
export const PICTURE_VIEWBOX = '0 0 96 96';
/** A picture is under this many bytes. */
export const MAX_PICTURE_BYTES = 2.5 * 1024;

/** The elements no picture may hold. */
const FORBIDDEN_ELEMENTS = ['text', 'image', 'script', 'foreignObject'] as const;

/** What is wrong with `source` as a memory picture, each problem in a plain sentence. None when it is one. */
export function pictureProblems(source: string): string[] {
  const problems: string[] = [];
  const bytes = new TextEncoder().encode(source).length;
  if (bytes >= MAX_PICTURE_BYTES) problems.push(`is ${bytes} bytes; a picture is under 2.5 KB`);

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return [...problems, 'does not parse as XML'];

  const svg = doc.documentElement;
  if (svg.localName !== 'svg') return [...problems, `is a ${svg.localName}, not an svg`];
  if (svg.namespaceURI !== SVG_NAMESPACE) problems.push(`has no ${SVG_NAMESPACE} namespace`);
  if (svg.getAttribute('viewBox') !== PICTURE_VIEWBOX) problems.push(`has viewBox "${svg.getAttribute('viewBox')}", not "${PICTURE_VIEWBOX}" (the 96 grid)`);

  for (const name of FORBIDDEN_ELEMENTS) {
    if (doc.getElementsByTagName(name).length > 0) problems.push(`has a <${name}>`);
  }
  if (/data:/i.test(source)) problems.push('has a data: URI');
  if (/href\s*=/i.test(source)) problems.push('has an href');
  const handlers = Array.from(doc.getElementsByTagName('*')).some((el) => Array.from(el.attributes).some((a) => /^on/i.test(a.name)));
  if (handlers) problems.push('has an on* event handler');
  return problems;
}

/** Whether `source` is a memory picture under every rule. */
export const isPicture = (source: unknown): source is string => typeof source === 'string' && pictureProblems(source).length === 0;
