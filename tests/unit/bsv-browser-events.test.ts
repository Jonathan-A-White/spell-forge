// scrypt-ts's Provider class does `class Provider extends events_1.default {}`
// (node_modules/scrypt-ts/dist/bsv/abstract-provider.js) — Vite's `events` alias
// (vite.config.ts) points that import at src/bsv/browser-events.ts. This covers the shim
// against the cases scrypt-ts's Provider subclasses actually exercise (mw-yo97u.12).
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../../src/bsv/browser-events';
import browserEventsDefault from '../../src/bsv/browser-events';

describe('browser-events EventEmitter shim', () => {
  it('a class can extend the default export', () => {
    class Provider extends browserEventsDefault {
      constructor() {
        super();
      }
    }
    const provider = new Provider();
    expect(provider).toBeInstanceOf(EventEmitter);
  });

  it('the default export is the same class as the named export', () => {
    expect(browserEventsDefault).toBe(EventEmitter);
  });

  it('on registers a listener that emit invokes with its arguments', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();
    emitter.on('connected', listener);
    emitter.emit('connected', true, 'testnet');
    expect(listener).toHaveBeenCalledWith(true, 'testnet');
  });

  it('once fires only once', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();
    emitter.once('connected', listener);
    emitter.emit('connected');
    emitter.emit('connected');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('off removes a listener so a later emit does not call it', () => {
    const emitter = new EventEmitter();
    const listener = vi.fn();
    emitter.on('networkChange', listener);
    emitter.off('networkChange', listener);
    emitter.emit('networkChange');
    expect(listener).not.toHaveBeenCalled();
  });

  it('emit returns true when a listener ran, false when none did', () => {
    const emitter = new EventEmitter();
    expect(emitter.emit('nothing-registered')).toBe(false);
    emitter.on('registered', () => {});
    expect(emitter.emit('registered')).toBe(true);
  });

  it('listenerCount reflects on and off', () => {
    const emitter = new EventEmitter();
    const listener = () => {};
    expect(emitter.listenerCount('x')).toBe(0);
    emitter.on('x', listener);
    expect(emitter.listenerCount('x')).toBe(1);
    emitter.off('x', listener);
    expect(emitter.listenerCount('x')).toBe(0);
  });
});
