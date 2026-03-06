// src/ocr/manager.ts — OcrManager: tries local first, falls back to remote

import type { OcrResult } from '../contracts/types.ts';
import { LocalOcrProvider } from './local.ts';
import { RemoteOcrProvider } from './remote.ts';
import { createTesseractRecognizer } from './tesseract-recognizer.ts';

export interface OcrManager {
  extractWords(image: Blob): Promise<OcrResult>;
  setRemoteEndpoint(url: string): void;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;

export class OcrManagerImpl implements OcrManager {
  private local: LocalOcrProvider;
  private remote: RemoteOcrProvider;
  private confidenceThreshold: number;

  constructor(
    local: LocalOcrProvider,
    remote: RemoteOcrProvider,
    options?: { confidenceThreshold?: number },
  ) {
    this.local = local;
    this.remote = remote;
    this.confidenceThreshold = options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  }

  setRemoteEndpoint(url: string): void {
    this.remote.setEndpoint(url);
  }

  async extractWords(image: Blob): Promise<OcrResult> {
    const errors: string[] = [];
    let lowConfidenceResult: OcrResult | null = null;

    // Try local first
    if (this.local.isAvailable()) {
      try {
        const result = await this.local.extractWords(image);
        if (result.confidence >= this.confidenceThreshold) {
          return result;
        }
        // Low confidence — save result and fall through to remote
        lowConfidenceResult = result;
        errors.push(`Local OCR confidence too low (${result.confidence.toFixed(2)})`);
      } catch (err) {
        errors.push(`Local OCR failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Local OCR provider is not available');
    }

    // Try remote fallback
    if (this.remote.isAvailable()) {
      try {
        return await this.remote.extractWords(image);
      } catch (err) {
        errors.push(`Remote OCR failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      errors.push('Remote OCR endpoint is not configured');
    }

    // If we have a low-confidence local result with words, return it
    // rather than failing entirely — the user can review and edit
    if (lowConfidenceResult && lowConfidenceResult.words.length > 0) {
      return lowConfidenceResult;
    }

    throw new Error(
      `All OCR providers failed:\n  - ${errors.join('\n  - ')}`,
    );
  }
}

/**
 * Convenience factory with sensible defaults.
 */
export function createOcrManager(options?: {
  remoteEndpoint?: string;
  confidenceThreshold?: number;
}): OcrManagerImpl {
  const local = new LocalOcrProvider(createTesseractRecognizer());
  const remote = new RemoteOcrProvider(options?.remoteEndpoint);
  return new OcrManagerImpl(local, remote, {
    confidenceThreshold: options?.confidenceThreshold,
  });
}
