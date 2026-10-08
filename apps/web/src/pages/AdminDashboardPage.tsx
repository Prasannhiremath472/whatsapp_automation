import { useAuthStore } from "../stores/auth.store";
import { Button } from "../components/Button";

export function AdminDashboardPage() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Super Admin Dashboard</h1>
          <Button variant="secondary" onClick={logout}>
            Log out
          </Button>
        </div>
        <nav className="flex gap-2">
          <span className="rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800">
            Tenants
          </span>
        </nav>
      </div>
    </div>
  );
}
