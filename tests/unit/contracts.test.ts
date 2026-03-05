import { describe, it, expect } from 'vitest';
import { createEventBus } from '../../src/contracts/events';
import type { AppEvent } from '../../src/contracts/types';

describe('EventBus', () => {
  it('should deliver events to subscribed handlers', () => {
    const bus = createEventBus();
    const received: AppEvent[] = [];

    bus.on('word:attempted', (event) => {
      received.push(event);
    });

    const event: AppEvent = {
      type: 'word:attempted',
      payload: {
        wordId: 'word-1',
        correct: true,
        technique: 'letter-bank',
        responseTimeMs: 5000,
        struggled: false,
      },
    };

    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it('should not deliver events to unsubscribed handlers', () => {
    const bus = createEventBus();
    const received: AppEvent[] = [];

    const unsub = bus.on('word:attempted', (event) => {
      received.push(event);
    });

    unsub();

    bus.emit({
      type: 'word:attempted',
      payload: {
        wordId: 'word-1',
        correct: true,
        technique: 'letter-bank',
        responseTimeMs: 5000,
        struggled: false,
      },
    });

    expect(received).toHaveLength(0);
  });

  it('should only deliver events of the subscribed type', () => {
    const bus = createEventBus();
    const received: AppEvent[] = [];

    bus.on('session:started', (event) => {
      received.push(event);
    });

    bus.emit({
      type: 'word:attempted',
      payload: {
        wordId: 'word-1',
        correct: true,
        technique: 'letter-bank',
        responseTimeMs: 5000,
        struggled: false,
      },
    });

    expect(received).toHaveLength(0);

    bus.emit({
      type: 'session:started',
      payload: { profileId: 'profile-1' },
    });

    expect(received).toHaveLength(1);
  });

  it('should handle errors in handlers without breaking other handlers', () => {
    const bus = createEventBus();
    const received: AppEvent[] = [];

    bus.on('session:started', () => {
      throw new Error('handler error');
    });

    bus.on('session:started', (event) => {
      received.push(event);
    });

    bus.emit({
      type: 'session:started',
      payload: { profileId: 'profile-1' },
    });

    expect(received).toHaveLength(1);
  });
});
