import type { Prefs } from '../src/config';

export function preferences() {
  const values = new Map<string, unknown>();
  const listeners = new Map<symbol, { name: string; notify: () => void }>();
  const prefs: Prefs = {
    get: (name) => values.get(name),
    set(name, value) {
      values.set(name, value);
      for (const { name: observed, notify } of listeners.values()) {
        if (observed === name) notify();
      }
    },
    registerObserver(name, notify) {
      const token = Symbol();
      listeners.set(token, { name, notify });
      return token;
    },
    unregisterObserver(id) {
      listeners.delete(id);
    },
  };
  return { prefs, values, listeners };
}
