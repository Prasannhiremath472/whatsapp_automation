import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

import AdminGate from "@/routes/_admin/route";
import IndexPage from "@/routes/index";
import LoginPage from "@/routes/login";
import ForgotPasswordPage from "@/routes/forgot-password";
import ResetPasswordPage from "@/routes/reset-password";
import AccessDeniedPage from "@/routes/access-denied";

import AccountPage from "@/routes/_admin/account";
import ActivityLogsPage from "@/routes/_admin/activity-logs";
import AdminUsersPage from "@/routes/_admin/admin-users";
import AiProvidersPage from "@/routes/_admin/ai-providers";
import AiTokensPage from "@/routes/_admin/ai-tokens";
import AiUsagePage from "@/routes/_admin/ai-usage";
import AnnouncementsPage from "@/routes/_admin/announcements";
import ApiManagementPage from "@/routes/_admin/api-management";
import AuditLogsPage from "@/routes/_admin/audit-logs";
import AutomationsPage from "@/routes/_admin/automations";
import BusinessAnalyticsPage from "@/routes/_admin/business-analytics";
import BusinessesPage from "@/routes/_admin/businesses";
import ClientSuccessPage from "@/routes/_admin/client-success";
import DashboardPage from "@/routes/_admin/dashboard";
import ErrorLogsPage from "@/routes/_admin/error-logs";
import IntegrationsPage from "@/routes/_admin/integrations";
import NotificationsPage from "@/routes/_admin/notifications";
import OffersPage from "@/routes/_admin/offers";
import OnboardingPage from "@/routes/_admin/onboarding";
import PaymentsPage from "@/routes/_admin/payments";
import PlansPage from "@/routes/_admin/plans";
import PlatformAnalyticsPage from "@/routes/_admin/platform-analytics";
import RequestsPage from "@/routes/_admin/requests";
import RevenueAnalyticsPage from "@/routes/_admin/revenue-analytics";
import RolesPage from "@/routes/_admin/roles";
import SecurityPage from "@/routes/_admin/security";
import SettingsPage from "@/routes/_admin/settings";
import SystemMonitoringPage from "@/routes/_admin/system-monitoring";
import TemplatesPage from "@/routes/_admin/templates";
import TicketsPage from "@/routes/_admin/tickets";
import UsageAnalyticsPage from "@/routes/_admin/usage-analytics";
import WhatsappPage from "@/routes/_admin/whatsapp";

const queryClient = new QueryClient();

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center"><div><h1 className="text-5xl font-bold">404</h1><p className="mt-3 text-sm text-muted-foreground">Page not found.</p><a href="/" className="mt-5 inline-block text-sm text-primary underline">Return home</a></div></div>;
}

export default function App() {
  return <BrowserRouter><QueryClientProvider client={queryClient}>
    <Routes>
      <Route path="/" element={<IndexPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route element={<AdminGate />}>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/activity-logs" element={<ActivityLogsPage />} />
        <Route path="/admin-users" element={<AdminUsersPage />} />
        <Route path="/ai-providers" element={<AiProvidersPage />} />
        <Route path="/ai-tokens" element={<AiTokensPage />} />
        <Route path="/ai-usage" element={<AiUsagePage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/api-management" element={<ApiManagementPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/automations" element={<AutomationsPage />} />
        <Route path="/business-analytics" element={<BusinessAnalyticsPage />} />
        <Route path="/businesses" element={<BusinessesPage />} />
        <Route path="/client-success" element={<ClientSuccessPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/error-logs" element={<ErrorLogsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/platform-analytics" element={<PlatformAnalyticsPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/revenue-analytics" element={<RevenueAnalyticsPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/system-monitoring" element={<SystemMonitoringPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/usage-analytics" element={<UsageAnalyticsPage />} />
        <Route path="/whatsapp" element={<WhatsappPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    <Toaster position="top-right" richColors />
  </QueryClientProvider></BrowserRouter>;
}
