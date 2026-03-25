// src/features/word-lists/pdf-generator.ts — Generate printable handwriting practice PDFs

import { jsPDF } from 'jspdf';

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

/**
 * Generate a printable handwriting practice PDF for a word list.
 * Returns a blob URL suitable for download or preview.
 */
export function generateWordListPdf(options: PdfOptions): string {
  const { mode, fontSize, listName, words } = options;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const fs = FONT_SIZES[fontSize];
  const { width: pageW, height: pageH, margin, colGap } = PAGE;
  const colWidth = (pageW - 2 * margin - colGap) / 2;

  // Height of one guide-line section (one row where a child writes)
  const sectionHeight = fs * 1.6;
  // Number of sections per word depends on mode
  const sectionsPerWord = mode === 'full' ? 3 : 2;
  // Total height per word block (sections + spacing between words)
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
    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text(listName, margin, y + 12);

    // Name line
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('Name:', pageW - margin - 180, y + 4);
    doc.setDrawColor(150);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([], 0);
    doc.line(pageW - margin - 150, y + 6, pageW - margin, y + 6);

    y += 26;
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
  // Word number
  const numWidth = fs * 1.0;
  doc.setFontSize(fs * 0.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160);
  doc.text(`${num}.`, x + 2, y + sectionHeight * 0.62);

  const textX = x + numWidth;
  const lineX1 = textX - 4;
  const lineX2 = x + colWidth;
  const textBaseline = 0.62; // vertical position ratio within section

  // --- Model line: solid dark word with guide lines ---
  doc.setFontSize(fs);
  doc.setFont('courier', 'normal');
  doc.setTextColor(40);
  doc.text(word, textX, y + sectionHeight * textBaseline);
  drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
  y += sectionHeight;

  // --- Trace line: dashed outline letters with guide lines ---
  if (mode === 'full' || mode === 'trace-only') {
    drawTracingText(doc, word, textX, y + sectionHeight * textBaseline, fs);
    drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
    y += sectionHeight;
  }

  // --- Blank write line: guide lines only ---
  if (mode === 'full' || mode === 'write-only') {
    drawGuideLines(doc, lineX1, y, lineX2, sectionHeight);
  }
}

/**
 * Draw three guide lines that mimic primary writing paper:
 * - Top line (light solid)
 * - Midline (dashed)
 * - Baseline (solid, slightly heavier)
 */
function drawGuideLines(doc: jsPDF, x1: number, y: number, x2: number, height: number): void {
  const topY = y + height * 0.15;
  const midY = y + height * 0.42;
  const baseY = y + height * 0.72;

  // Top line
  doc.setDrawColor(190);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([], 0);
  doc.line(x1, topY, x2, topY);

  // Midline (dashed)
  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(x1, midY, x2, midY);

  // Baseline (solid, darker)
  doc.setDrawColor(140);
  doc.setLineWidth(0.6);
  doc.setLineDashPattern([], 0);
  doc.line(x1, baseY, x2, baseY);
}

/**
 * Draw tracing text — dashed letter outlines that children trace over.
 *
 * Uses PDF text rendering mode 1 (stroke) combined with a dash pattern
 * to produce dotted/dashed letter outlines. Falls back to light gray
 * filled text if stroke rendering is unavailable.
 */
function drawTracingText(doc: jsPDF, text: string, x: number, y: number, fontSize: number): void {
  doc.setFontSize(fontSize);
  doc.setFont('courier', 'normal');

  // Access internal write for raw PDF commands (not in TS types)
  const pdfWrite = (doc.internal as unknown as Record<string, (cmd: string) => void>).write;

  if (typeof pdfWrite === 'function') {
    // Use PDF text rendering mode 1 (stroke) with dash pattern
    // for traditional dotted/dashed letter outlines
    try {
      pdfWrite.call(doc.internal, 'q');             // save graphics state
      pdfWrite.call(doc.internal, '[1.5 2] 0 d');   // dash pattern
      pdfWrite.call(doc.internal, '0.5 w');          // thin stroke width
      pdfWrite.call(doc.internal, '0.65 0.65 0.65 RG'); // light gray stroke
      pdfWrite.call(doc.internal, '1 1 1 rg');       // white fill

      // jsPDF text() supports renderingMode in v2.5+
      const textOptions: Parameters<typeof doc.text>[3] = {};
      (textOptions as Record<string, unknown>)['renderingMode'] = 'stroke';
      doc.text(text, x, y, textOptions);

      pdfWrite.call(doc.internal, 'Q');             // restore graphics state
      return;
    } catch {
      // Fall through to gray text fallback
    }
  }

  // Fallback: light gray filled text (still traceable)
  doc.setTextColor(200, 200, 200);
  doc.text(text, x, y);
  doc.setTextColor(40);
}

/** Visible for testing — expose layout constants */
export const _testing = {
  FONT_SIZES,
  PAGE,
};
