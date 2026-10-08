import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { InboxPage } from "./routes/app/inbox/InboxPage";
import { CatalogAdminPage } from "./pages/CatalogAdminPage";
import { BroadcastAdminPage } from "./pages/BroadcastAdminPage";
import { BotTesterPage } from "./pages/BotTesterPage";
import { ProtectedRoute } from "./router/ProtectedRoute";
import { RoleGate } from "./router/RoleGate";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleGate allow={["super_admin"]}>
              <AdminDashboardPage />
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route path="/app" element={<Navigate to="/app/inbox" replace />} />
      <Route
        path="/app/inbox"
        element={
          <ProtectedRoute>
            <RoleGate allow={["tenant_admin", "agent"]}>
              <InboxPage />
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/catalog"
        element={
          <ProtectedRoute>
            <RoleGate allow={["tenant_admin"]}>
              <CatalogAdminPage />
            </RoleGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/broadcasts"
        element={
          <ProtectedRoute>
            <RoleGate allow={["tenant_admin"]}>
              <BroadcastAdminPage />
            </RoleGate>
          </ProtectedRoute>
        }
      />
      {/* Dev-only: simulates a customer chatting with the commerce bot without real Meta credentials. */}
      <Route path="/dev/bot-tester" element={<BotTesterPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
