import { useSyncExternalStore } from "react";

/**
 * Local demo persistence layer. Every collection is backed by localStorage
 * under a namespaced key. Replace `createCollection` implementations with
 * API/Cloud-backed versions later — pages only talk to services.
 */
export type Row = { id: string; [key: string]: any };

const NS = "genie_admin_demo_v1:";

export interface Collection<T extends Row> {
  key: string;
  getAll: () => T[];
  get: (id: string) => T | undefined;
  insert: (item: T) => T;
  update: (id: string, patch: Partial<T>) => T | undefined;
  remove: (id: string) => void;
  reset: () => void;
  subscribe: (fn: () => void) => () => void;
}

const registry: Collection<any>[] = [];

export function createCollection<T extends Row = Row>(key: string, rawSeed: () => object[]): Collection<T> {
  const seed = rawSeed as unknown as () => T[];
  let items: T[] | null = null;
  const listeners = new Set<() => void>();
  const serverSnapshot = seed();

  const load = (): T[] => {
    if (items) return items;
    if (typeof window === "undefined") return serverSnapshot;
    try {
      const raw = window.localStorage.getItem(NS + key);
      items = raw ? (JSON.parse(raw) as T[]) : seed();
    } catch {
      items = seed();
    }
    return items;
  };
  const commit = (next: T[]) => {
    items = next;
    try {
      window.localStorage.setItem(NS + key, JSON.stringify(next));
    } catch {
      /* quota — ignore in demo */
    }
    listeners.forEach((l) => l());
  };

  const c: Collection<T> = {
    key,
    getAll: load,
    get: (id) => load().find((i) => i.id === id),
    insert: (item) => {
      commit([item, ...load()]);
      return item;
    },
    update: (id, patch) => {
      let updated: T | undefined;
      commit(
        load().map((i) => {
          if (i.id !== id) return i;
          updated = { ...i, ...patch };
          return updated;
        }),
      );
      return updated;
    },
    remove: (id) => commit(load().filter((i) => i.id !== id)),
    reset: () => commit(seed()),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  registry.push(c);
  return c;
}

export function useCollection<T extends Row>(c: Collection<T>): T[] {
  return useSyncExternalStore(c.subscribe, c.getAll, c.getAll);
}

export function resetAllDemoData() {
  registry.forEach((c) => c.reset());
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}
