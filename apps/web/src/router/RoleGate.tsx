import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import type { UserRole } from "@whatsapp-crm/shared-types";
import { useAuthStore } from "../stores/auth.store";

/** Restricts children to the given roles; redirects elsewhere otherwise. */
export function RoleGate({ allow, children }: PropsWithChildren<{ allow: UserRole[] }>) {
  const role = useAuthStore((s) => s.claims?.role);

  if (!role || !allow.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
