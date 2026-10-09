export { AudioManagerImpl } from './manager.ts';
export type { AudioManager } from './manager.ts';
export { useAudioBusy } from './use-audio-busy.ts';
export { useTutorSpeech } from './use-tutor-speech.ts';
export { sayWord, stopSpeaking, sayWordSlowly, spellWord, sayThenSpell, isTtsAvailable, warmUp, hasVoicesForLanguage, getTtsStatus, sayAsTutor, pauseTutorSpeech, resumeTutorSpeech, restartTutorSpeech, getTutorSpeech, subscribeTutorSpeech, pickPosternVoice, listTutorVoices, onVoicesChanged } from './speech.ts';
export { MAX_RECORDING_MS, MicUnavailable, ReadingRecorder, pickMime } from './recorder.ts';
export type { HoldRecorder, Recording } from './recorder.ts';
export type { TutorSpeechState } from './speech.ts';
