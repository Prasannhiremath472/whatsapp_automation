import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/admin-layout/AdminLayout";
import { AccessDenied } from "@/components/admin/AuthScreens";
import { useSession } from "@/lib/admin/session";
import { ALL_NAV } from "@/lib/admin/nav";
import { can } from "@/lib/permissions/roles";

export default function AdminGate() {
  const [hydrated, setHydrated] = useState(false);
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (hydrated && !session) navigate("/login", { replace: true });
  }, [hydrated, session, navigate]);

  if (!hydrated || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading console…</div>;
  }

  const path = location.pathname;
  const item = ALL_NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));
  const allowed = !item || can(session.role, item.perm);

  return <AdminLayout>{allowed ? <Outlet /> : <AccessDenied />}</AdminLayout>;
}
