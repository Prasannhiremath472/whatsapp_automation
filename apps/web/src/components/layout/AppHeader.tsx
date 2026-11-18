import { useLocation, useNavigate } from "react-router-dom";
import { Bell, HelpCircle, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { contactName, useConversations } from "@/api/inbox";
import { useAuth, useSession } from "@/lib/auth";
import { allNav } from "./nav";

export function AppHeader() {
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();
  const { tenant, user } = useSession();
  const { logout } = useAuth();
  const unread = (useConversations().data ?? []).filter((c) => c.unreadCount > 0);
  const initials = user.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const [open, setOpen] = useState(false);
  const current = allNav.find((n) => (n.url === "/" ? path === "/" : path.startsWith(n.url)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb className="hidden sm:block">
        <BreadcrumbList>
          <BreadcrumbItem>{tenant.name}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">{current?.title ?? "Page"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline"
          onClick={() => setOpen(true)}
          className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground transition-colors hover:border-ring/50 md:w-72"
        >
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Search contacts, campaigns…</span>
          <kbd className="ml-auto hidden rounded border bg-card px-1.5 text-[10px] font-medium md:inline">⌘K</kbd>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unread.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications {unread.length > 0 && <span className="text-xs font-normal text-primary">{unread.length} unread</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {unread.length === 0 && <div className="px-3 py-4 text-center text-sm text-muted-foreground">You are all caught up.</div>}
            {unread.slice(0, 6).map((c) => (
              <DropdownMenuItem key={c.id} className="items-start gap-3 py-2.5" onClick={() => navigate("/inbox")}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <div className="truncate text-sm">{contactName(c.contact)}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.lastMessage?.preview ?? "New message"}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => navigate("/help")}>
          <HelpCircle className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <Avatar className="ml-1 h-8 w-8">
                <AvatarFallback className="bg-foreground text-xs font-semibold text-background">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="truncate text-sm font-medium">{user.displayName}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void logout()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, contacts, campaigns…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            {allNav.map((n) => (
              <CommandItem
                key={n.url}
                onSelect={() => {
                  setOpen(false);
                  navigate(n.url);
                }}
              >
                <n.icon className="h-4 w-4" /> {n.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Recent contacts">
            {["Priya Sharma", "Rahul Mehta", "Ananya Iyer"].map((c) => (
              <CommandItem key={c} onSelect={() => {setOpen(false);navigate("/contacts");}}>{c}</CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  );
}
