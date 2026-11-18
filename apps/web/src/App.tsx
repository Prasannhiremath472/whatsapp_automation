import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import { RequireAuth } from "@/lib/RequireAuth";
import LoginPage from "@/routes/login";

import DashboardPage from "@/routes/index";
import InboxPage from "@/routes/inbox";
import ContactsPage from "@/routes/contacts";
import CampaignsPage from "@/routes/campaigns";
import TemplatesPage from "@/routes/templates";
import AutomationsPage from "@/routes/automation";
import AgentsPage from "@/routes/ai-agents";
import AnalyticsPage from "@/routes/analytics";
import AccountsPage from "@/routes/whatsapp-accounts";
import TeamsPage from "@/routes/teams";
import IntegrationsPage from "@/routes/integrations";
import DeveloperPage from "@/routes/developer";
import ChannelsPage from "@/routes/channels";
import ApiKeysPage from "@/routes/api-keys";
import WebhooksPage from "@/routes/webhooks";
import ApiLogsPage from "@/routes/api-logs";
import ApiDocsPage from "@/routes/api-docs";
import HelpPage from "@/routes/help";
import SettingsPage from "@/routes/settings";
import ProfilePage from "@/routes/profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Do not retry client errors (4xx): they will not fix themselves.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status > 0 && error.status < 500) && failureCount < 2,
    },
  },
});

function RouteTitle() {
  const location = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Dashboard", "/inbox": "Team Inbox", "/contacts": "Contacts",
      "/campaigns": "Campaigns", "/templates": "Message Templates",
      "/automation": "Automations", "/ai-agents": "Genie AI Agents",
      "/analytics": "Analytics", "/whatsapp-accounts": "WhatsApp Accounts",
      "/teams": "Users & Teams", "/integrations": "Integrations",
      "/developer": "Get Started", "/channels": "Channels", "/api-keys": "API Keys",
      "/webhooks": "Webhooks", "/api-logs": "API Logs",
      "/api-docs": "API Documentation", "/help": "Help & Support",
      "/settings": "Settings", "/profile": "User Profile",
    };
    document.title = `${titles[location.pathname] ?? "Genie"} — WhatsApp Business Automation`;
  }, [location.pathname]);
  return null;
}

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md text-center"><h1 className="text-7xl font-bold text-foreground">404</h1><h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2><p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p><a href="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</a></div></div>;
}

function AppLayout() {
  return <SidebarProvider><AppSidebar /><SidebarInset className="min-w-0 bg-background"><AppHeader /><main className="mx-auto w-full max-w-[1440px] flex-1 p-4 md:p-6 lg:p-8"><RouteTitle /><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/inbox" element={<InboxPage />} />
    <Route path="/contacts" element={<ContactsPage />} />
    <Route path="/campaigns" element={<CampaignsPage />} />
    <Route path="/templates" element={<TemplatesPage />} />
    <Route path="/automation" element={<AutomationsPage />} />
    <Route path="/ai-agents" element={<AgentsPage />} />
    <Route path="/analytics" element={<AnalyticsPage />} />
    <Route path="/whatsapp-accounts" element={<AccountsPage />} />
    <Route path="/teams" element={<TeamsPage />} />
    <Route path="/integrations" element={<IntegrationsPage />} />
    <Route path="/developer" element={<DeveloperPage />} />
    <Route path="/channels" element={<ChannelsPage />} />
    <Route path="/api-keys" element={<ApiKeysPage />} />
    <Route path="/webhooks" element={<WebhooksPage />} />
    <Route path="/api-logs" element={<ApiLogsPage />} />
    <Route path="/api-docs" element={<ApiDocsPage />} />
    <Route path="/help" element={<HelpPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="*" element={<NotFound />} />
  </Routes></main></SidebarInset></SidebarProvider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={0}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              />
            </Routes>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
