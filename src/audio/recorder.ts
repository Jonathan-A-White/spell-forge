// src/audio/recorder.ts — Records the child reading aloud (mw-bhvxcn.9): the phone's microphone through
// MediaRecorder, Opus where the browser has it (iOS Safari gives audio/mp4). After Postern's recorder. A reading is heard
// whole, however long he reads a problem, up to MAX_RECORDING_MS (ten minutes; at 32 kbps that is about 2.4 MB, inside the
// tutor-turn grind's 8 MB attachment limit, grinds/tutor-turn.json, and the mill's local scorer takes a clip of any length).
// What comes out is one clip, sent as a grist file. A reading the cap stops is marked `capped`, and the tutor says so.

export interface Recording {
  blob: Blob;
  /** The clip's mime without its codec: audio/webm, audio/ogg or audio/mp4. */
  mime: string;
  durationMs: number;
  /** The cap stopped this recording, not he: the tutor's reply says the reading was cut (reading-loop.tsx). */
  capped?: boolean;
}

/** The longest reading heard: a reading is cut here and sent as it stands, marked `capped`. */
export const MAX_RECORDING_MS = 600_000;

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

  /** `onLimit` gets the clip, marked `capped`, when the cap stops the recording; a stop() before the cap never calls it. */
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
      void this.stop().then((recording) => this.onLimit?.({ ...recording, capped: true }));
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
