// src/worlds/maths/ConceptPicture.tsx — The concept's mnemonic picture, drawn beside what the child is working on (Kestrel 19d): the maths
// world's question and the homework picture. It asks for the picture when the concept changes and shows nothing until one comes, or when
// none can be had (no licence, a failed grind, an SVG that broke a rule): a picture is decoration, never needed, and never the answer.
import { useEffect, useRef, useState } from 'react';
import { mnemonicPicture, type MnemonicNode } from '../../learn/mnemonic-pictures';
import { conceptNode } from './maths-pictures';

export interface ConceptPictureProps {
  /** The node of the maths graph the child is on; none for a problem the graph has not seen. */
  nodeId?: string;
  /** The picture for a node, or undefined when there is none to show: the picture module's when absent. */
  picture?: (node: MnemonicNode) => Promise<string | undefined>;
  /** Its size and shape; a 96 px tile when absent. */
  className?: string;
}

export function ConceptPicture({ nodeId, picture = mnemonicPicture, className = 'w-24 h-24 shrink-0 rounded-xl bg-sf-surface' }: ConceptPictureProps) {
  const [drawing, setDrawing] = useState<{ nodeId: string; svg: string } | null>(null);
  const latest = useRef(picture);
  useEffect(() => {
    latest.current = picture;
  });

  useEffect(() => {
    const node = conceptNode(nodeId);
    if (!node) return;
    let current = true;
    void Promise.resolve()
      .then(() => latest.current(node))
      .catch(() => undefined)
      .then((svg) => {
        if (current && svg) setDrawing({ nodeId: node.id, svg });
      });
    return () => {
      current = false;
    };
  }, [nodeId]);

  if (!drawing || drawing.nodeId !== nodeId) return null;
  return (
    <img
      data-testid="mnemonic-picture"
      alt=""
      aria-hidden="true"
      src={`data:image/svg+xml;utf8,${encodeURIComponent(drawing.svg)}`}
      className={className}
    />
  );
}
