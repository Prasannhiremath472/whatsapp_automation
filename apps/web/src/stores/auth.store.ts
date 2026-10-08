import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JwtClaims, User } from "@whatsapp-crm/shared-types";

function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  claims: JwtClaims | null;
  login: (params: { accessToken: string; refreshToken: string; user: User }) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      claims: null,
      login: ({ accessToken, refreshToken, user }) => {
        set({
          accessToken,
          refreshToken,
          user,
          claims: decodeJwt(accessToken),
        });
      },
      logout: () => {
        set({ accessToken: null, refreshToken: null, user: null, claims: null });
      },
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: "whatsapp-crm-auth" },
  ),
);
