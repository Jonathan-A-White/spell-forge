// src/features/word-lists/pdf-generator.ts — Generate printable handwriting practice PDFs

import { jsPDF } from 'jspdf';
import { patrickHandBase64 } from './patrick-hand-font';

export type PdfMode = 'full' | 'trace-only' | 'write-only';
export type PdfFontSize = 'small' | 'medium' | 'large';

export interface PdfOptions {
  mode: PdfMode;
  fontSize: PdfFontSize;
  listName: string;
  words: string[];
}

const FONT_SIZES: Record<PdfFontSize, number> = {
  small: 18,
  medium: 24,
  large: 32,
};

/** Points per inch */
const PPI = 72;

/** Page dimensions in points (US Letter) */
const PAGE = {
  width: 8.5 * PPI,   // 612
  height: 11 * PPI,   // 792
  margin: 40,
  colGap: 24,
};

const HANDWRITING_FONT = 'PatrickHand';

/** Register the handwriting font with a jsPDF document. */
function registerFont(doc: jsPDF): void {
  const callVFS = doc.addFileToVFS as (filename: string, data: string) => typeof doc;
  callVFS.call(doc, 'PatrickHand-Regular.ttf', patrickHandBase64);
  doc.addFont('PatrickHand-Regular.ttf', HANDWRITING_FONT, 'normal');
}

/** Set the handwriting font, falling back to courier if unavailable. */
function setHandwritingFont(doc: jsPDF): void {
  try {
    doc.setFont(HANDWRITING_FONT, 'normal');
  } catch {
    doc.setFont('courier', 'normal');
  }
}

/**
 * Generate a printable handwriting practice PDF for a word list.
 * Returns a blob URL suitable for download or preview.
 */
export function generateWordListPdf(options: PdfOptions): string {
  const doc = buildPdfDoc(options);
  return doc.output('bloburl').toString();
}

/**
 * Download the PDF directly (triggers browser download).
 */
export function downloadWordListPdf(options: PdfOptions): void {
  const doc = buildPdfDoc(options);
  const safeName = options.listName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'word-list';
  doc.save(`${safeName} - Practice Sheet.pdf`);
}

/** Build the jsPDF document (shared by generate and download). */
function buildPdfDoc(options: PdfOptions): jsPDF {
  const { mode, fontSize, listName, words } = options;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  // Register handwriting font
  registerFont(doc);

  const fs = FONT_SIZES[fontSize];
  const { width: pageW, height: pageH, margin, colGap } = PAGE;
  const colWidth = (pageW - 2 * margin - colGap) / 2;

  const sectionHeight = fs * 1.6;
  const sectionsPerWord = mode === 'full' ? 3 : 2;
  const wordBlockHeight = sectionHeight * sectionsPerWord + 10;

  let pageNum = 0;
  let wordIdx = 0;

  while (wordIdx < words.length) {
    if (pageNum > 0) doc.addPage();

    const headerY = drawHeader(doc, listName, margin, pageW, pageNum === 0);
    const startY = headerY + 12;
    const usableHeight = pageH - margin - startY;
    const wordsPerCol = Math.floor(usableHeight / wordBlockHeight);

    for (let col = 0; col < 2 && wordIdx < words.length; col++) {
      const colX = margin + col * (colWidth + colGap);
      let y = startY;

      for (let row = 0; row < wordsPerCol && wordIdx < words.length; row++) {
        drawWordBlock(doc, words[wordIdx], wordIdx + 1, colX, y, colWidth, fs, sectionHeight, mode);
        y += wordBlockHeight;
        wordIdx++;
      }
    }

    pageNum++;
  }

  return doc;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Draw page header. Returns the Y position after the header. */
function drawHeader(doc: jsPDF, listName: string, margin: number, pageW: number, isFirstPage: boolean): number {
  let y = margin;

  if (isFirstPage) {
    // Title in handwriting font
    doc.setFontSize(20);
    setHandwritingFont(doc);
    doc.setTextColor(30);
    doc.text(listName, margin, y + 14);

    // Name line
    doc.setFontSize(14);
    setHandwritingFont(doc);
    doc.setTextColor(100);
    doc.text('Name:', pageW - margin - 180, y + 6);
    doc.setDrawColor(150);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([], 0);
    doc.line(pageW - margin - 145, y + 8, pageW - margin, y + 8);

    y += 28;
    // Separator line
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  } else {
    // Smaller header on continuation pages
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`${listName} (continued)`, margin, y + 8);
    y += 16;
  }

  return y;
}

/** Draw one word block: number + model + optional trace + optional blank line. */
function drawWordBlock(
  doc: jsPDF,
  word: string,
  num: number,
  x: number,
  y: number,
  colWidth: number,
  fs: number,
  sectionHeight: number,
  mode: PdfMode,
): void {
  // Word number — vertically centered at the baseline
  const numWidth = fs * 1.0;
  doc.setFontSize(fs * 0.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160);
  doc.text(`${num}.`, x + 2, y + sectionHeight * BASELINE);

  const textX = x + numWidth;
  const lineX1 = textX - 4;
  const lineX2 = x + colWidth;

  // --- Model line: solid dark word in handwriting font with guide lines ---
  doc.setFontSize(fs);
  setHandwritingFont(doc);
  doc.setTextColor(40);
  doc.text(word, textX, y + sectionHeight * BASELINE);
  drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
  y += sectionHeight;

  // --- Trace line: light gray letters to trace over ---
  if (mode === 'full' || mode === 'trace-only') {
    drawTracingText(doc, word, textX, y + sectionHeight * BASELINE, fs);
    drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
    y += sectionHeight;
  }

  // --- Blank write line: guide lines only ---
  if (mode === 'full' || mode === 'write-only') {
    drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
  }
}

/**
 * Guide line vertical positions within a section, as ratios of sectionHeight.
 *
 * Modeled after standard primary/elementary writing paper:
 *   ─── Ascender line   (top)        — where l, t, h, k, b, d reach
 *   --- x-height line   (midline)    — where a, c, e, o, s top out
 *   ─── Baseline                     — where all letters sit
 *   ─── Descender line  (bottom)     — where g, y, p, q, j drop to
 */
const ASCENDER = 0.12;
const MIDLINE = 0.42;
const BASELINE = 0.72;
const DESCENDER = 0.92;

/**
 * Draw four guide lines that mimic primary writing paper:
 * - Ascender line (top, solid)
 * - x-height / midline (dashed)
 * - Baseline (solid, heavier)
 * - Descender line (bottom, light)
 */
function drawGuideLines(doc: jsPDF, x1: number, y: number, x2: number, height: number): void {
  const ascY = y + height * ASCENDER;
  const midY = y + height * MIDLINE;
  const baseY = y + height * BASELINE;
  const descY = y + height * DESCENDER;

  // Ascender line (top)
  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([], 0);
  doc.line(x1, ascY, x2, ascY);

  // Midline / x-height (dashed)
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(x1, midY, x2, midY);

  // Baseline (solid, darker, heavier)
  doc.setDrawColor(120);
  doc.setLineWidth(0.7);
  doc.setLineDashPattern([], 0);
  doc.line(x1, baseY, x2, baseY);

  // Descender line (bottom, light)
  doc.setDrawColor(180);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([], 0);
  doc.line(x1, descY, x2, descY);
}

/**
 * Draw tracing text — light gray filled letters that children trace over.
 *
 * Uses a light gray color so the letter shapes are clearly visible but
 * subtle enough that pencil marks on top are easy to see.
 */
function drawTracingText(doc: jsPDF, text: string, x: number, y: number, fontSize: number): void {
  doc.setFontSize(fontSize);
  setHandwritingFont(doc);
  doc.setTextColor(200, 200, 200);
  doc.text(text, x, y);
  doc.setTextColor(40);
}

/** Visible for testing — expose layout constants */
export const _testing = {
  FONT_SIZES,
  PAGE,
};
