// src/features/front-door/TutorText.tsx — every tutor answer is drawn through this (M16): its markdown as markup, never a
// literal star or hash, and said aloud in the tutor's voice as the same plain words. The front door's answers and the
// parent ask's (mw-79en7t.17) take it; one that is only to be read again passes speak={false}.
import { Fragment, useEffect, useMemo, type ReactNode } from 'react';
import { sayAsTutor } from '../../audio';
import { parseMarkdown, plainText, type Inline } from './tutor-markdown';

function drawInline(inline: Inline[]): ReactNode {
  return inline.map((part, i) => {
    switch (part.t) {
      case 'text':
        return <Fragment key={i}>{part.s}</Fragment>;
      case 'code':
        return <code key={i}>{part.s}</code>;
      case 'strong':
        return <strong key={i}>{drawInline(part.c)}</strong>;
      case 'em':
        return <em key={i}>{drawInline(part.c)}</em>;
    }
  });
}

export interface TutorTextProps {
  /** The answer, as the tutor wrote it. */
  text: string;
  /** Say it aloud (the default). */
  speak?: boolean;
  className?: string;
}

export function TutorText({ text, speak = true, className }: TutorTextProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const plain = useMemo(() => plainText(text), [text]);

  useEffect(() => {
    if (speak && plain) void sayAsTutor(plain);
  }, [speak, plain]);

  return (
    <div className={className ?? 'space-y-2'}>
      {blocks.map((block, i) => {
        switch (block.t) {
          case 'heading':
            return (
              <p key={i} role="heading" aria-level={Math.min(block.level + 1, 6)} className="font-bold text-sf-heading">
                {drawInline(block.c)}
              </p>
            );
          case 'p':
            return <p key={i}>{drawInline(block.c)}</p>;
          case 'ul':
            return (
              <ul key={i} className="list-disc pl-6 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j}>{drawInline(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="list-decimal pl-6 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j}>{drawInline(item)}</li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
