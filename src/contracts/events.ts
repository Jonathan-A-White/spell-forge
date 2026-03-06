import type { AppEvent, EventBus } from './types';

type EventHandler = (event: AppEvent) => void;

export function createEventBus(): EventBus {
  const handlers = new Map<AppEvent['type'], Set<EventHandler>>();

  return {
    emit(event: AppEvent): void {
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          try {
            handler(event);
          } catch (error) {
            console.error(`Event handler error for ${event.type}:`, error);
          }
        }
      }
    },

    on(type: AppEvent['type'], handler: EventHandler): () => void {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);

      // Return unsubscribe function
      return () => {
        const typeHandlers = handlers.get(type);
        if (typeHandlers) {
          typeHandlers.delete(handler);
          if (typeHandlers.size === 0) {
            handlers.delete(type);
          }
        }
      };
    },
  };
}
