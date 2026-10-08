import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";

export function ProtectedRoute({ children }: PropsWithChildren) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
