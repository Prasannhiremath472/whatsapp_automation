import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/permissions/roles";

export interface AdminSession {
  name: string;
  email: string;
  role: Role;
}

const KEY = "genie_admin_session";
const listeners = new Set<() => void>();
let cache: AdminSession | null | undefined;

function read(): AdminSession | null {
  if (typeof window === "undefined") return null;
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : null;
  } catch {
    cache = null;
  }
  return cache ?? null;
}

export const sessionStore = {
  get: read,
  signIn(s: AdminSession, remember: boolean) {
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
    cache = s;
    listeners.forEach((l) => l());
  },
  setRole(role: Role) {
    const s = read();
    if (!s) return;
    const next = { ...s, role };
    if (localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.setItem(KEY, JSON.stringify(next));
    cache = next;
    listeners.forEach((l) => l());
  },
  signOut() {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    cache = null;
    listeners.forEach((l) => l());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, read, () => null);
}
