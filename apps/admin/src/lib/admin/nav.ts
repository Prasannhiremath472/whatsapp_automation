import {
  LayoutDashboard, Rocket, Building2, HeartPulse, Inbox, CreditCard, IndianRupee, TicketPercent, FileText, Coins,
  MessageCircle, Bot, BarChart3, Workflow, Plug, KeyRound, LifeBuoy, Megaphone, Bell, LineChart, PieChart,
  TrendingUp, Activity, Server, Bug, History, Users, ShieldCheck, ScrollText, Lock, Settings, type LucideIcon,
} from "lucide-react";
import type { PermGroup } from "@/lib/permissions/roles";

export interface NavItem { title: string; to: string; icon: LucideIcon; perm: PermGroup }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ title: "Dashboard", to: "/dashboard", icon: LayoutDashboard, perm: "dashboard" }] },
  {
    label: "Client Management",
    items: [
      { title: "Onboarding", to: "/onboarding", icon: Rocket, perm: "onboarding" },
      { title: "Businesses", to: "/businesses", icon: Building2, perm: "businesses" },
      { title: "Client Success", to: "/client-success", icon: HeartPulse, perm: "businesses" },
      { title: "Client Requests & Queries", to: "/requests", icon: Inbox, perm: "requests" },
    ],
  },
  {
    label: "SaaS Management",
    items: [
      { title: "Plans & Subscriptions", to: "/plans", icon: CreditCard, perm: "subscriptions" },
      { title: "Payments & Revenue", to: "/payments", icon: IndianRupee, perm: "finance" },
      { title: "Custom Offers & Coupons", to: "/offers", icon: TicketPercent, perm: "subscriptions" },
      { title: "Templates Management", to: "/templates", icon: FileText, perm: "whatsapp" },
      { title: "AI Token Management", to: "/ai-tokens", icon: Coins, perm: "ai" },
    ],
  },
  {
    label: "Platform Management",
    items: [
      { title: "WhatsApp Management", to: "/whatsapp", icon: MessageCircle, perm: "whatsapp" },
      { title: "AI Providers", to: "/ai-providers", icon: Bot, perm: "ai" },
      { title: "AI Usage Analytics", to: "/ai-usage", icon: BarChart3, perm: "ai" },
      { title: "Automation Monitoring", to: "/automations", icon: Workflow, perm: "operations" },
      { title: "Integrations", to: "/integrations", icon: Plug, perm: "operations" },
      { title: "API Management", to: "/api-management", icon: KeyRound, perm: "settings" },
    ],
  },
  {
    label: "Communication",
    items: [
      { title: "Customer Support Tickets", to: "/tickets", icon: LifeBuoy, perm: "support" },
      { title: "Announcements", to: "/announcements", icon: Megaphone, perm: "communication" },
      { title: "Notifications", to: "/notifications", icon: Bell, perm: "dashboard" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { title: "Platform Analytics", to: "/platform-analytics", icon: LineChart, perm: "analytics" },
      { title: "Business Analytics", to: "/business-analytics", icon: PieChart, perm: "analytics" },
      { title: "Revenue Analytics", to: "/revenue-analytics", icon: TrendingUp, perm: "finance" },
      { title: "Usage Analytics", to: "/usage-analytics", icon: Activity, perm: "analytics" },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "System Monitoring", to: "/system-monitoring", icon: Server, perm: "operations" },
      { title: "Error Logs", to: "/error-logs", icon: Bug, perm: "operations" },
      { title: "Activity Logs", to: "/activity-logs", icon: History, perm: "operations" },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Admin Users", to: "/admin-users", icon: Users, perm: "settings" },
      { title: "Roles & Permissions", to: "/roles", icon: ShieldCheck, perm: "settings" },
      { title: "Audit Logs", to: "/audit-logs", icon: ScrollText, perm: "settings" },
      { title: "Security", to: "/security", icon: Lock, perm: "settings" },
      { title: "Global Settings", to: "/settings", icon: Settings, perm: "settings" },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));
