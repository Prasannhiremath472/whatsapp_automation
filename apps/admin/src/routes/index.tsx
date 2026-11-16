import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { sessionStore } from "@/lib/admin/session";

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(sessionStore.get() ? "/dashboard" : "/login", { replace: true });
  }, [navigate]);
  return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Opening Genie console…</div>;
}

export default Index;
