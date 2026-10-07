// mw-bhvxcn.9: the reading recorder, after Postern's: MediaRecorder with the first supported Opus mime, 32 kbps,
// echo cancellation on, one Blob with the codec stripped, a 60 s cap, a plain line when the mic is refused.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_MS, MicUnavailable, ReadingRecorder, pickMime } from '../../src/audio';
import type { Recording } from '../../src/audio';

/** jsdom has no MediaRecorder: a stub that records how it was built and hands back one chunk on stop. */
class StubMediaRecorder {
  static supported = new Set<string>(['audio/webm;codecs=opus', 'audio/webm']);
  static last: StubMediaRecorder | undefined;
  static isTypeSupported = (mime: string) => StubMediaRecorder.supported.has(mime);
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  startedWith: number | undefined;
  stream: unknown;
  options: { mimeType?: string; audioBitsPerSecond?: number } | undefined;
  constructor(stream: unknown, options?: { mimeType?: string; audioBitsPerSecond?: number }) {
    this.stream = stream;
    this.options = options;
    this.mimeType = options?.mimeType ?? '';
    StubMediaRecorder.last = this;
  }
  start(timeslice?: number) {
    this.state = 'recording';
    this.startedWith = timeslice;
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();

beforeEach(() => {
  StubMediaRecorder.supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
  StubMediaRecorder.last = undefined;
  track.stop.mockClear();
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal('MediaRecorder', StubMediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('pickMime', () => {
  it('takes the first supported of webm/opus, ogg/opus, mp4, webm', () => {
    expect(pickMime((m) => m !== 'audio/webm;codecs=opus' && m !== 'audio/ogg;codecs=opus' && m !== 'audio/mp4')).toBe('audio/webm');
    expect(pickMime((m) => m === 'audio/mp4' || m === 'audio/webm')).toBe('audio/mp4');
    expect(pickMime((m) => m === 'audio/ogg;codecs=opus' || m === 'audio/mp4')).toBe('audio/ogg;codecs=opus');
    expect(pickMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickMime(() => false)).toBe('');
  });
});

describe('ReadingRecorder', () => {
  it('asks for the mic with echo cancellation and noise suppression, records at 32 kbps and returns one clip without the codec', async () => {
    const recorder = new ReadingRecorder();
    await recorder.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } });
    expect(StubMediaRecorder.last?.options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32_000 });
    const clip = await recorder.stop();
    expect(clip.mime).toBe('audio/webm');
    expect(clip.blob.type).toBe('audio/webm');
    expect(clip.blob.size).toBe(3);
    expect(track.stop).toHaveBeenCalled();
  });

  it('gives audio/mp4 where that is what the browser has (iOS Safari)', async () => {
    StubMediaRecorder.supported = new Set(['audio/mp4']);
    const recorder = new ReadingRecorder();
    await recorder.start();
    expect((await recorder.stop()).mime).toBe('audio/mp4');
  });

  it('says in a plain line that the microphone is off when it is refused, and keeps no stream', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const error = await new ReadingRecorder().start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicUnavailable);
    expect((error as Error).message).toMatch(/microphone/i);
  });

  it('says so when there is no recorder in this browser', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const error = await new ReadingRecorder().start().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicUnavailable);
  });

  it('stops at 60 s by itself and hands over the clip', async () => {
    vi.useFakeTimers();
    expect(MAX_RECORDING_MS).toBe(60_000);
    const clips: Recording[] = [];
    const recorder = new ReadingRecorder((clip) => clips.push(clip));
    await recorder.start();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(clips).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(clips).toHaveLength(1);
    expect(clips[0].mime).toBe('audio/webm');
    expect(clips[0].durationMs).toBeGreaterThanOrEqual(59_000);
    expect(StubMediaRecorder.last?.state).toBe('inactive');
    expect(track.stop).toHaveBeenCalled();
  });

  it('does not hand over a clip by itself when it is stopped before the cap', async () => {
    vi.useFakeTimers();
    const onLimit = vi.fn();
    const recorder = new ReadingRecorder(onLimit);
    await recorder.start();
    await vi.advanceTimersByTimeAsync(2_000);
    const clip = await recorder.stop();
    expect(clip.durationMs).toBe(2_000);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(onLimit).not.toHaveBeenCalled();
  });
});
