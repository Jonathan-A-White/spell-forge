// src/ocr/index.ts — barrel export

export { LocalOcrProvider } from './local.ts';
export type { RecognizerFn } from './local.ts';
export { RemoteOcrProvider } from './remote.ts';
export { OcrManagerImpl, createOcrManager, DEFAULT_CONFIDENCE_THRESHOLD } from './manager.ts';
export type { OcrManager } from './manager.ts';
export { cleanWords, normalizeWhitespace, filterImportWords } from './utils.ts';
export { correctOcrWords } from './spell-check.ts';
export { createTesseractRecognizer } from './tesseract-recognizer.ts';
export { addPadding, rotateImage, recognizeWithOrientationDetection } from './preprocess.ts';
export type { OcrWorker } from './preprocess.ts';
