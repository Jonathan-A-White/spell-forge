export { AudioManagerImpl } from './manager.ts';
export type { AudioManager } from './manager.ts';
export { useAudioBusy } from './use-audio-busy.ts';
export { TUTOR_SPEECH_KEY, sayAsTutor, pauseTutorSpeech } from './tutor-speech.ts';
export { sayWord, stopSpeaking, sayWordSlowly, spellWord, sayThenSpell, isTtsAvailable, warmUp, hasVoicesForLanguage, getTtsStatus, listTutorVoices, onVoicesChanged } from './speech.ts';
export { MAX_RECORDING_MS, MicUnavailable, ReadingRecorder, pickMime } from './recorder.ts';
export type { HoldRecorder, Recording } from './recorder.ts';
