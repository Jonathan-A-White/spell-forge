// src/audio/recorder.ts — Records the child reading aloud (mw-bhvxcn.9): the phone's microphone through
// MediaRecorder, Opus where the browser has it (iOS Safari gives audio/mp4). After Postern's recorder, with a
// 60 s cap, because the scorer's short-audio limit is a minute. What comes out is one clip, sent as a grist file.

export interface Recording {
  blob: Blob;
  /** The clip's mime without its codec: audio/webm, audio/ogg or audio/mp4. */
  mime: string;
  durationMs: number;
}

/** The scorer takes short audio only; a reading is cut here and sent as it stands. */
export const MAX_RECORDING_MS = 60_000;

const PREFERRED = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const NO_MIC = 'The microphone is turned off for this page. Turn it on in the browser settings, then try again.';
const NO_RECORDER = 'This browser cannot record your voice.';

/** The microphone cannot be used; the message is worded for the child and his parent. */
export class MicUnavailable extends Error {
  constructor(message: string = NO_MIC) {
    super(message);
    this.name = 'MicUnavailable';
  }
}

export function pickMime(isSupported: (mime: string) => boolean = (mime) => MediaRecorder.isTypeSupported(mime)): string {
  return PREFERRED.find((mime) => isSupported(mime)) ?? '';
}

/** What the Tutor screen holds to record a reading; the real one is ReadingRecorder, tests give their own. */
export interface HoldRecorder {
  start(): Promise<void>;
  stop(): Promise<Recording>;
  cancel(): void;
}

export class ReadingRecorder implements HoldRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private cap: ReturnType<typeof setTimeout> | undefined;
  private readonly onLimit: ((recording: Recording) => void) | undefined;

  /** `onLimit` gets the clip when the cap stops the recording; a stop() before the cap never calls it. */
  constructor(onLimit?: (recording: Recording) => void) {
    this.onLimit = onLimit;
  }

  async start(): Promise<void> {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new MicUnavailable(NO_RECORDER);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new MicUnavailable();
    }
    const mime = pickMime();
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.startedAt = Date.now();
    this.recorder.start(1000);
    this.cap = setTimeout(() => {
      this.cap = undefined;
      void this.stop().then((recording) => this.onLimit?.(recording));
    }, MAX_RECORDING_MS);
  }

  stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder) return Promise.reject(new Error('Not recording.'));
    if (this.cap !== undefined) clearTimeout(this.cap);
    this.cap = undefined;
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = (recorder.mimeType || this.chunks[0]?.type || 'audio/webm').split(';')[0];
        const recording = { blob: new Blob(this.chunks, { type: mime }), mime, durationMs: Date.now() - this.startedAt };
        this.release();
        resolve(recording);
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.cap !== undefined) clearTimeout(this.cap);
    this.cap = undefined;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
