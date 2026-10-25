// src/features/word-lists/pdf-export-dialog.tsx — Modal for PDF export options

import { useState, useCallback, useMemo } from 'react';
import { useAlive } from 'pwa-kit/alive';
import type { PdfMode, PdfFontSize } from './pdf-generator';
import { downloadWordListPdf } from './pdf-generator';
import { FormDoor, type FormTutor } from '../tutor/form-door';
import { PDF_FORM, savePdfCommand } from '../tutor/form-commands';

interface PdfExportDialogProps {
  listName: string;
  words: string[];
  onClose: () => void;
  /** Offers 'Let the tutor do it' for Practice Mode and Letter Size; Send downloads as Download PDF does. No door when absent. */
  tutor?: FormTutor;
}

const MODE_OPTIONS: { value: PdfMode; label: string; desc: string }[] = [
  { value: 'full', label: 'Full Practice', desc: 'Model word + trace + blank line' },
  { value: 'trace-only', label: 'Trace Only', desc: 'Model word + trace line' },
  { value: 'write-only', label: 'Write Only', desc: 'Model word + blank line' },
];

const SIZE_OPTIONS: { value: PdfFontSize; label: string; desc: string }[] = [
  { value: 'small', label: 'Small', desc: 'More words per page (~14)' },
  { value: 'medium', label: 'Medium', desc: 'Balanced size (~10)' },
  { value: 'large', label: 'Large', desc: 'Fewer words, bigger letters (~6)' },
];

export function PdfExportDialog({ listName, words, onClose, tutor }: PdfExportDialogProps) {
  const [mode, setMode] = useState<PdfMode>('full');
  const [fontSize, setFontSize] = useState<PdfFontSize>('medium');
  const [generating, setGenerating] = useState(false);
  // The dialog opens on Full Practice and Medium; the tutor asks about a choice that has not been made, by hand or by him.
  const [picked, setPicked] = useState({ mode: false, size: false });
  const alive = useAlive();

  /** The one download: Download PDF and the tutor's Send both end here. */
  const generate = useCallback((pdfMode: PdfMode, pdfFontSize: PdfFontSize) => {
    if (words.length === 0) throw new Error('There are no words to print');
    setGenerating(true);
    // Use setTimeout to let the UI update before the synchronous PDF generation
    setTimeout(() => {
      try {
        downloadWordListPdf({ mode: pdfMode, fontSize: pdfFontSize, listName, words });
      } finally {
        if (alive()) setGenerating(false);
      }
    }, 50);
  }, [listName, words, alive]);

  const handleGenerate = useCallback(() => generate(mode, fontSize), [generate, mode, fontSize]);
  const generateCommand = useMemo(() => savePdfCommand(generate), [generate]);

  const chooseMode = (value: PdfMode) => {
    setMode(value);
    setPicked((p) => ({ ...p, mode: true }));
  };
  const chooseSize = (value: PdfFontSize) => {
    setFontSize(value);
    setPicked((p) => ({ ...p, size: true }));
  };

  /** What the tutor fills in is shown in the choices as if he had tapped them. */
  const fillFromTutor = (field: string, value: string) => {
    if (field === 'mode') {
      const chosen = MODE_OPTIONS.find((o) => o.label === value);
      if (chosen) chooseMode(chosen.value);
    } else if (field === 'size') {
      const chosen = SIZE_OPTIONS.find((o) => o.label === value);
      if (chosen) chooseSize(chosen.value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="pdf-export-dialog">
      <div className="bg-sf-surface rounded-xl border border-sf-border p-6 max-w-md w-full shadow-xl">
        <h2 className="text-lg font-bold text-sf-heading mb-1">Print Practice Sheet</h2>
        <p className="text-sm text-sf-muted mb-5">
          Generate a printable PDF for <strong className="text-sf-heading">{listName}</strong> ({words.length} word{words.length !== 1 ? 's' : ''})
        </p>

        {tutor && (
          <FormDoor
            form={PDF_FORM}
            command={generateCommand}
            values={{
              mode: picked.mode ? (MODE_OPTIONS.find((o) => o.value === mode)?.label ?? '') : '',
              size: picked.size ? (SIZE_OPTIONS.find((o) => o.value === fontSize)?.label ?? '') : '',
            }}
            onFill={fillFromTutor}
            tutor={tutor}
          />
        )}

        {/* Mode selection */}
        <fieldset className="mb-5">
          <legend className="text-sm font-bold text-sf-heading mb-2">Practice Mode</legend>
          <div className="space-y-2">
            {MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  mode === opt.value
                    ? 'border-sf-primary bg-sf-primary/5'
                    : 'border-sf-border hover:border-sf-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="pdf-mode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => chooseMode(opt.value)}
                  className="mt-0.5 accent-sf-primary"
                />
                <div>
                  <span className="text-sm font-medium text-sf-heading">{opt.label}</span>
                  <span className="block text-xs text-sf-muted mt-0.5">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Font size selection */}
        <fieldset className="mb-6">
          <legend className="text-sm font-bold text-sf-heading mb-2">Letter Size</legend>
          <div className="flex gap-2">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => chooseSize(opt.value)}
                className={`flex-1 py-2 px-3 rounded-lg border text-center transition-all ${
                  fontSize === opt.value
                    ? 'border-sf-primary bg-sf-primary/5 text-sf-heading font-bold'
                    : 'border-sf-border text-sf-muted hover:border-sf-border-strong'
                }`}
                title={opt.desc}
              >
                <span className="text-sm">{opt.label}</span>
                <span className="block text-[10px] text-sf-muted mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-sf-heading bg-sf-track hover:bg-sf-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || words.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-sf-primary-text bg-sf-primary hover:bg-sf-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            data-testid="pdf-generate-btn"
          >
            {generating ? (
              <>
                <span className="w-4 h-4 border-2 border-sf-primary-text border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <PrintIcon />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
