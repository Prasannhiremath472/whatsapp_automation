import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, UNAUTHORIZED_EVENT, api, tokenStore, type Tokens } from "./api";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: "tenant_admin" | "agent" | "super_admin";
  tenantId: string | null;
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string;
  businessCategory: string | null;
  timezone: string;
}

interface Profile {
  user: SessionUser;
  tenant: SessionTenant | null;
}

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser; tenant: SessionTenant };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** This app is for business users. Platform super-admins use the separate admin panel. */
function assertBusinessUser(
  profile: Profile,
): asserts profile is Profile & { tenant: SessionTenant } {
  if (profile.user.role === "super_admin" || !profile.tenant) {
    throw new ApiError(
      "This account is a platform administrator. Please sign in to the admin panel instead.",
      403,
    );
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const queryClient = useQueryClient();

  const loadProfile = useCallback(async () => {
    const profile = await api<Profile>("/auth/me");
    assertBusinessUser(profile);
    setState({ status: "authenticated", user: profile.user, tenant: profile.tenant });
  }, []);

  // Restore the session on first load.
  useEffect(() => {
    if (!tokenStore.get()) {
      setState({ status: "anonymous" });
      return;
    }
    loadProfile().catch(() => {
      tokenStore.clear();
      setState({ status: "anonymous" });
    });
  }, [loadProfile]);

  // A refresh failure anywhere in the app signs the user out.
  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.clear();
      setState({ status: "anonymous" });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokens = await api<Tokens>("/auth/login", {
        method: "POST",
        body: { email, password },
        anonymous: true,
      });
      tokenStore.set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      try {
        await loadProfile();
      } catch (err) {
        tokenStore.clear();
        throw err;
      }
    },
    [loadProfile],
  );

  const logout = useCallback(async () => {
    const tokens = tokenStore.get();
    if (tokens) {
      await api("/auth/logout", {
        method: "POST",
        body: { refreshToken: tokens.refreshToken },
        anonymous: true,
      }).catch(() => undefined);
    }
    tokenStore.clear();
    queryClient.clear();
    setState({ status: "anonymous" });
  }, [queryClient]);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user + tenant. Only call inside <RequireAuth>. */
export function useSession(): { user: SessionUser; tenant: SessionTenant } {
  const { state } = useAuth();
  if (state.status !== "authenticated")
    throw new Error("useSession requires an authenticated user");
  return { user: state.user, tenant: state.tenant };
}
