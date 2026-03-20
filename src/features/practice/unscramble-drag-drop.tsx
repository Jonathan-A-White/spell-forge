// src/features/practice/unscramble-drag-drop.tsx — Drag-and-drop unscramble component

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { hapticTap, hapticError } from '../../core/haptics';

interface UnscrambleDragDropProps {
  scrambledLetters: string;
  wordLength: number;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
  tapTargetSize: number;
  submitLabel: string;
  submitDisabled?: boolean;
}

interface LetterTile {
  letter: string;
  id: string;
  /** Index in the answer slots, or null if still in bank */
  placedAt: number | null;
}

export function UnscrambleDragDrop({
  scrambledLetters,
  wordLength,
  onSubmit,
  disabled = false,
  tapTargetSize,
  submitLabel,
  submitDisabled = false,
}: UnscrambleDragDropProps) {
  const [tiles, setTiles] = useState<LetterTile[]>(() =>
    scrambledLetters.split('').map((letter, i) => ({
      letter,
      id: `tile-${i}`,
      placedAt: null,
    })),
  );

  const [draggedTileId, setDraggedTileId] = useState<string | null>(null);
  const [touchDragTile, setTouchDragTile] = useState<string | null>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Build answer from placed tiles
  const answer = useMemo(() => {
    const slots = new Array<string>(wordLength).fill('');
    for (const tile of tiles) {
      if (tile.placedAt !== null) {
        slots[tile.placedAt] = tile.letter;
      }
    }
    return slots.join('');
  }, [tiles, wordLength]);

  const allPlaced = tiles.every((t) => t.placedAt !== null);

  // Find first empty slot
  const findFirstEmptySlot = useCallback((): number | null => {
    const occupied = new Set(tiles.filter((t) => t.placedAt !== null).map((t) => t.placedAt));
    for (let i = 0; i < wordLength; i++) {
      if (!occupied.has(i)) return i;
    }
    return null;
  }, [tiles, wordLength]);

  // Place a tile in a slot
  const placeTile = useCallback(
    (tileId: string, slotIndex: number) => {
      if (disabled) return;
      setTiles((prev) => {
        // Check if slot is occupied
        const occupant = prev.find((t) => t.placedAt === slotIndex);
        if (occupant && occupant.id !== tileId) {
          // Swap: send occupant back to bank, place new tile
          return prev.map((t) => {
            if (t.id === tileId) return { ...t, placedAt: slotIndex };
            if (t.id === occupant.id) return { ...t, placedAt: null };
            return t;
          });
        }
        return prev.map((t) => (t.id === tileId ? { ...t, placedAt: slotIndex } : t));
      });
      hapticTap();
    },
    [disabled],
  );

  // Remove a tile from its slot (tap to remove)
  const removeTile = useCallback(
    (tileId: string) => {
      if (disabled) return;
      setTiles((prev) => prev.map((t) => (t.id === tileId ? { ...t, placedAt: null } : t)));
      hapticTap();
    },
    [disabled],
  );

  // Tap on a bank tile: place in first empty slot
  const handleBankTap = useCallback(
    (tileId: string) => {
      if (disabled) return;
      const slot = findFirstEmptySlot();
      if (slot !== null) {
        placeTile(tileId, slot);
      }
    },
    [disabled, findFirstEmptySlot, placeTile],
  );

  // HTML5 Drag and Drop handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, tileId: string) => {
      if (disabled) return;
      e.dataTransfer.setData('text/plain', tileId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggedTileId(tileId);
    },
    [disabled],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedTileId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleSlotDrop = useCallback(
    (e: React.DragEvent, slotIndex: number) => {
      e.preventDefault();
      const tileId = e.dataTransfer.getData('text/plain');
      if (tileId) {
        placeTile(tileId, slotIndex);
      }
      setDraggedTileId(null);
    },
    [placeTile],
  );

  // Drop on bank area: remove tile from slot
  const handleBankDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const tileId = e.dataTransfer.getData('text/plain');
      if (tileId) {
        removeTile(tileId);
      }
      setDraggedTileId(null);
    },
    [removeTile],
  );

  // Touch drag handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, tileId: string) => {
      if (disabled) return;
      const touch = e.touches[0];
      setTouchDragTile(tileId);
      setTouchPos({ x: touch.clientX, y: touch.clientY });
    },
    [disabled],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchDragTile) return;
      e.preventDefault();
      const touch = e.touches[0];
      setTouchPos({ x: touch.clientX, y: touch.clientY });
    },
    [touchDragTile],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchDragTile || !touchPos) {
      setTouchDragTile(null);
      setTouchPos(null);
      return;
    }

    // Find which slot the touch ended over
    let placed = false;
    for (let i = 0; i < slotRefs.current.length; i++) {
      const slot = slotRefs.current[i];
      if (!slot) continue;
      const rect = slot.getBoundingClientRect();
      if (
        touchPos.x >= rect.left &&
        touchPos.x <= rect.right &&
        touchPos.y >= rect.top &&
        touchPos.y <= rect.bottom
      ) {
        placeTile(touchDragTile, i);
        placed = true;
        break;
      }
    }

    if (!placed) {
      // If dropped outside slots, remove from slot if it was placed
      const tile = tiles.find((t) => t.id === touchDragTile);
      if (tile?.placedAt !== null) {
        removeTile(touchDragTile);
      }
    }

    setTouchDragTile(null);
    setTouchPos(null);
  }, [touchDragTile, touchPos, placeTile, removeTile, tiles]);

  const handleSubmit = useCallback(() => {
    if (allPlaced) {
      onSubmit(answer);
    } else {
      hapticError();
    }
  }, [allPlaced, answer, onSubmit]);

  // Responsive sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const slotSize = useMemo(() => {
    if (containerWidth === 0) return tapTargetSize;
    const gap = 8;
    const maxPerSlot = (containerWidth - gap * (wordLength - 1)) / wordLength;
    return Math.max(28, Math.min(tapTargetSize, Math.floor(maxPerSlot)));
  }, [containerWidth, tapTargetSize, wordLength]);

  const bankTiles = tiles.filter((t) => t.placedAt === null);
  const bankCols = Math.min(bankTiles.length || 1, 6);
  const bankTileSize = useMemo(() => {
    if (containerWidth === 0) return tapTargetSize;
    const gap = 10;
    const maxPerTile = (containerWidth - gap * (bankCols - 1)) / bankCols;
    return Math.max(32, Math.min(tapTargetSize, Math.floor(maxPerTile)));
  }, [containerWidth, tapTargetSize, bankCols]);

  const sizeStr = `${slotSize}px`;
  const fontSize = `${Math.max(14, slotSize * 0.45)}px`;
  const bankSizeStr = `${bankTileSize}px`;
  const bankFontSize = `${Math.max(16, bankTileSize * 0.45)}px`;
  const buttonSize = `${tapTargetSize}px`;

  // Get tile for a given slot index
  const getTileAtSlot = (slotIndex: number): LetterTile | undefined =>
    tiles.find((t) => t.placedAt === slotIndex);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-5 w-full">
      {/* Answer slots */}
      <div className="flex gap-2 justify-center flex-wrap">
        {Array.from({ length: wordLength }, (_, i) => {
          const placed = getTileAtSlot(i);
          const isDropTarget = draggedTileId !== null;

          return (
            <div
              key={i}
              ref={(el) => { slotRefs.current[i] = el; }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleSlotDrop(e, i)}
              onClick={() => placed && !disabled && removeTile(placed.id)}
              className={`flex items-center justify-center rounded-lg border-2 transition-all cursor-pointer select-none ${
                placed
                  ? 'border-sf-primary bg-sf-primary/10'
                  : isDropTarget
                    ? 'border-sf-primary border-dashed bg-sf-primary/5 animate-pulse'
                    : 'border-dashed border-sf-border-strong bg-sf-surface'
              } ${disabled ? 'opacity-60' : ''}`}
              style={{ width: sizeStr, height: sizeStr, minWidth: sizeStr }}
              role="button"
              aria-label={placed ? `Slot ${i + 1}: ${placed.letter}, tap to remove` : `Empty slot ${i + 1}`}
            >
              {placed && (
                <span className="font-bold text-sf-heading uppercase" style={{ fontSize }}>
                  {placed.letter}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Instruction hint */}
      <p className="text-xs text-sf-faint select-none text-center">
        Tap a letter to place it in the next empty slot. Tap a placed letter to remove it.
      </p>

      {/* Letter bank */}
      <div
        className="flex flex-wrap gap-2.5 justify-center w-full min-h-[60px] p-3 rounded-xl"
        onDragOver={handleDragOver}
        onDrop={handleBankDrop}
      >
        {tiles.map((tile) => {
          if (tile.placedAt !== null) return null;
          const isDragging = draggedTileId === tile.id || touchDragTile === tile.id;

          return (
            <button
              key={tile.id}
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, tile.id)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, tile.id)}
              onTouchMove={(e) => handleTouchMove(e)}
              onTouchEnd={handleTouchEnd}
              onClick={() => handleBankTap(tile.id)}
              disabled={disabled}
              className={`rounded-xl font-bold uppercase transition-all shadow-md select-none
                bg-sf-surface hover:bg-sf-surface-hover text-sf-heading
                border-2 border-sf-border-strong hover:border-sf-primary
                active:scale-95 cursor-grab active:cursor-grabbing
                ${isDragging ? 'opacity-40 scale-95' : ''}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              style={{
                width: bankSizeStr,
                height: bankSizeStr,
                fontSize: bankFontSize,
                minWidth: bankSizeStr,
                minHeight: bankSizeStr,
                touchAction: 'none',
              }}
              aria-label={`Letter ${tile.letter}`}
            >
              {tile.letter}
            </button>
          );
        })}
      </div>

      {/* Touch drag ghost */}
      {touchDragTile && touchPos && (() => {
        const tile = tiles.find((t) => t.id === touchDragTile);
        if (!tile) return null;
        return (
          <div
            className="fixed pointer-events-none z-50 rounded-xl font-bold uppercase
              bg-sf-primary text-sf-primary-text border-2 border-sf-primary
              flex items-center justify-center shadow-lg"
            style={{
              width: bankSizeStr,
              height: bankSizeStr,
              fontSize: bankFontSize,
              left: touchPos.x - bankTileSize / 2,
              top: touchPos.y - bankTileSize / 2,
            }}
          >
            {tile.letter}
          </div>
        );
      })()}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitDisabled || !allPlaced}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minHeight: buttonSize }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
