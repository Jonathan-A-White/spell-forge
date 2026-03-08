// src/ocr/remote.ts — Remote server fallback OCR provider

import type { OcrProvider, OcrResult } from '../contracts/types.ts';
import { cleanWords, normalizeWhitespace } from './utils.ts';
import { correctOcrWords } from './spell-check.ts';

export class RemoteOcrProvider implements OcrProvider {
  private endpoint: string | null;

  constructor(endpoint?: string) {
    this.endpoint = endpoint ?? null;
  }

  setEndpoint(url: string): void {
    this.endpoint = url;
  }

  getEndpoint(): string | null {
    return this.endpoint;
  }

  isAvailable(): boolean {
    return this.endpoint !== null && this.endpoint.length > 0;
  }

  async extractWords(image: Blob): Promise<OcrResult> {
    if (!this.endpoint) {
      throw new Error('Remote OCR endpoint is not configured');
    }

    const formData = new FormData();
    formData.append('image', image);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Remote OCR request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { text: string; confidence: number };
    const rawText = normalizeWhitespace(data.text);
    const words = correctOcrWords(cleanWords(rawText));

    return {
      rawText,
      words,
      confidence: data.confidence,
      source: 'remote',
    };
  }
}
