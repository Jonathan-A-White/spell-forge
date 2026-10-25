// src/features/front-door/tutor-markdown.ts — the little markdown a tutor answer may hold (M16), read into blocks for
// TutorText to draw and into plain text for the voice to say. Headings, bullet and numbered lists, **strong**, *emphasis*,
// `code`, and a link (its words, not its address). Nothing else is markup: a star or hash that is not a mark stays as
// typed, and what is read is never HTML (it is drawn as React text, so markup in an answer shows as the characters).

export type Inline = { t: 'text'; s: string } | { t: 'strong'; c: Inline[] } | { t: 'em'; c: Inline[] } | { t: 'code'; s: string };

export type Block =
  | { t: 'heading'; level: number; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] };

const WORD = /[\p{L}\p{N}]/u;
const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWord = (ch: string | undefined) => ch !== undefined && WORD.test(ch);

/** Where `mark` closes, after `from`: a mark that follows a non-space (and, for an underscore, does not run into a word). */
function closing(src: string, mark: string, from: number): number {
  for (let j = src.indexOf(mark, from); j !== -1; j = src.indexOf(mark, j + 1)) {
    if (isSpace(src[j - 1])) continue;
    const after = src[j + mark.length];
    if (mark.startsWith('_') && isWord(after)) continue;
    if (mark === '*' && after === '*') continue;
    return j;
  }
  return -1;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', s: text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '`') {
      const j = src.indexOf('`', i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: 'code', s: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const at = ch === '!' ? i + 1 : i;
      const link = /^\[([^\]]*)\]\([^)\s]*\)/.exec(src.slice(at));
      if (link) {
        flush();
        out.push(...parseInline(link[1]));
        i = at + link[0].length;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const double = src[i + 1] === ch;
      const mark = double ? ch + ch : ch;
      const opens = !isSpace(src[i + mark.length]) && src[i + mark.length] !== ch && !(ch === '_' && isWord(src[i - 1]));
      const j = opens ? closing(src, mark, i + mark.length + 1) : -1;
      if (j !== -1) {
        flush();
        const inner = parseInline(src.slice(i + mark.length, j));
        out.push(double ? { t: 'strong', c: inner } : { t: 'em', c: inner });
        i = j + mark.length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,3}[.)]\s+(.*)$/;
const SKIPPED = /^\s*(```.*|~~~.*|([-*_])(\s*\2){2,})\s*$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: Inline[][] } | undefined;
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ t: 'p', c: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items });
    list = undefined;
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^\s{0,3}>\s?/, '');
    if (line.trim() === '' || SKIPPED.test(line)) {
      endParagraph();
      endList();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ t: 'heading', level: heading[1].length, c: parseInline(heading[2]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      endParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (list?.kind !== kind) {
        endList();
        list = { kind, items: [] };
      }
      list.items.push(parseInline(item[1]));
      continue;
    }
    endList();
    paragraph.push(line.trim());
  }
  endParagraph();
  endList();
  return blocks;
}

const inlineText = (inline: Inline[]): string =>
  inline.map((part) => (part.t === 'text' || part.t === 'code' ? part.s : inlineText(part.c))).join('');

/** The words of an answer with the marks off, one block (or list item) to a line: what the voice says. */
export function plainText(src: string): string {
  const lines: string[] = [];
  for (const block of parseMarkdown(src)) {
    if (block.t === 'ul' || block.t === 'ol') lines.push(...block.items.map(inlineText));
    else lines.push(inlineText(block.c));
  }
  return lines.join('\n');
}
