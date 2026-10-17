// Tiny key-value store for the auth session: localStorage on web, memory elsewhere
// (native builds would swap in AsyncStorage; the demo is the web app).

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

export function defaultStore(): KeyValueStore {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (ls) {
      const probe = '__element_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return {
        get: (k) => {
          try {
            return ls.getItem(k);
          } catch {
            return null;
          }
        },
        set: (k, v) => {
          try {
            ls.setItem(k, v);
          } catch {
            // storage full or blocked: the session just won't survive a reload
          }
        },
        remove: (k) => {
          try {
            ls.removeItem(k);
          } catch {
            // ignore
          }
        },
      };
    }
  } catch {
    // private mode or blocked storage
  }
  return memoryStore();
}
