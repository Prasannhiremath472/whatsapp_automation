import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  roles?: ("tenant_admin" | "agent")[];
  disabled?: boolean;
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 flex-shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

const ICONS = {
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z",
  megaphone: "M11 5.882V19.24a1.76 1.76 0 0 1-3.417.592l-2.147-6.15M18 13.5c1.5 0 3-1.5 3-3.5s-1.5-3.5-3-3.5m-14 4h4l6-4v11l-6-4H4a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2Z",
  users: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m5-6.13a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6 2a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM9 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  cart: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m-10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
  robot: "M12 8V4H8m8 4V4h-4m-6 8h16M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M9 16h.01M15 16h.01",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
} as const;

const NAV_ITEMS: NavItem[] = [
  { label: "Live Chat", to: "/app/inbox", icon: <Icon path={ICONS.chat} /> },
  { label: "Campaigns", to: "/app/broadcasts", icon: <Icon path={ICONS.megaphone} />, roles: ["tenant_admin"] },
  { label: "Contacts", to: "/app/contacts", icon: <Icon path={ICONS.users} />, disabled: true },
  { label: "Catalog", to: "/app/catalog", icon: <Icon path={ICONS.cart} />, roles: ["tenant_admin"] },
  { label: "AI Agent", to: "/app/ai-agent", icon: <Icon path={ICONS.robot} />, disabled: true },
  { label: "Settings", to: "/app/settings", icon: <Icon path={ICONS.settings} />, disabled: true },
];

/**
 * Shared sidebar shell for every authenticated tenant page. Pages render
 * their own content in `children` — this owns nav, branding, and logout so
 * neither InboxPage nor CatalogAdminPage/BroadcastAdminPage need their own
 * header anymore.
 */
export function AppLayout({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.user?.role);
  const displayName = useAuthStore((s) => s.user?.displayName);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role as "tenant_admin" | "agent"));

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white">
            E
          </div>
          <span className="text-sm font-semibold text-gray-900">EduConnect</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {visibleItems.map((item) =>
            item.disabled ? (
              <span
                key={item.label}
                aria-disabled="true"
                title="Coming soon"
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-gray-300"
              >
                {item.icon}
                {item.label}
              </span>
            ) : (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 truncate px-1 text-xs text-gray-400">{displayName}</div>
          <button
            onClick={logout}
            className="w-full rounded-md bg-gray-100 px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 ${fullBleed ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</main>
    </div>
  );
}
