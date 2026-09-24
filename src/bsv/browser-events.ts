// src/bsv/browser-events.ts — scrypt-ts/dist/bsv/abstract-provider.js:21 does
// `class Provider extends events_1.default {}`, requiring Node's `events` module. Vite has no
// resolve.alias for it (vite.config.ts), so it externalizes `events` to an empty module for
// the browser build; evaluating `class Provider extends {}` then throws "Class extends value
// #<Object> is not a constructor or null" the moment the License/Fuel bridge chunk loads
// (mw-yo97u.12, following mw-yo97u.11's `process` stand-in). Aliasing `events` to this file
// gives Provider a real class to extend, with the EventEmitter methods scrypt-ts's Provider
// subclasses actually call (mainly `emit`; `on`/`off`/`once` cover Node's usual shape).
//
// Both a default export and a named `EventEmitter` export: Node's `events` module exports
// the EventEmitter class as both `module.exports` and `module.exports.EventEmitter`, and
// callers use either `require("events")` or `const { EventEmitter } = require("events")`.

type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private listenersByEvent = new Map<string | symbol, Listener[]>();

  on(event: string | symbol, listener: Listener): this {
    const listeners = this.listenersByEvent.get(event) ?? [];
    listeners.push(listener);
    this.listenersByEvent.set(event, listeners);
    return this;
  }

  once(event: string | symbol, listener: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string | symbol, listener: Listener): this {
    const listeners = this.listenersByEvent.get(event);
    if (!listeners) return this;
    const remaining = listeners.filter((registered) => registered !== listener);
    if (remaining.length > 0) this.listenersByEvent.set(event, remaining);
    else this.listenersByEvent.delete(event);
    return this;
  }

  removeListener(event: string | symbol, listener: Listener): this {
    return this.off(event, listener);
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this.listenersByEvent.clear();
    else this.listenersByEvent.delete(event);
    return this;
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const listeners = this.listenersByEvent.get(event);
    if (!listeners || listeners.length === 0) return false;
    for (const listener of [...listeners]) listener(...args);
    return true;
  }

  listenerCount(event: string | symbol): number {
    return this.listenersByEvent.get(event)?.length ?? 0;
  }
}

export default EventEmitter;
