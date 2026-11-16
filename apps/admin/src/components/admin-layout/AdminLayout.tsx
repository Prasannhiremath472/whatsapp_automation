import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, CircleHelp, LogOut, Menu, Search, Settings, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ALL_NAV, NAV } from "@/lib/admin/nav";
import { sessionStore, useSession } from "@/lib/admin/session";
import { can, ROLE_LABEL, type Role } from "@/lib/permissions/roles";
import { useCollection } from "@/lib/admin/store";
import { db } from "@/services/admin";
import { relative } from "@/lib/admin/format";
import { Avatar } from "@/components/admin-ui/primitives";
import { cn } from "@/lib/utils";
import { GenieMark } from "./GenieMark";

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const session = useSession()!;
  const path = useLocation().pathname;
  const navigate = useNavigate();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(session.role, i.perm)) })).filter((g) => g.items.length);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-5")}>
        <GenieMark className="size-8" />
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-extrabold tracking-[0.2em] text-sidebar-accent-foreground">GENIE</p>
            <p className="text-[9px] font-semibold tracking-[0.18em] text-sidebar-muted">SUPER ADMIN CONSOLE</p>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Admin navigation">
        {groups.map((g) => {
          const isClosed = closed[g.label] && !g.items.some((i) => path.startsWith(i.to));
          return (
            <div key={g.label} className="mb-2">
              {!collapsed && (
                <button
                  className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted hover:text-sidebar-foreground"
                  onClick={() => setClosed((s) => ({ ...s, [g.label]: !s[g.label] }))}
                  aria-expanded={!isClosed}
                >
                  {g.label}
                  <ChevronDown className={cn("size-3 transition-transform", isClosed && "-rotate-90")} />
                </button>
              )}
              {!isClosed && g.items.map((i) => {
                const active = path === i.to || path.startsWith(i.to + "/");
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={onNavigate}
                    title={collapsed ? i.title : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1.5 h-5 w-0.5 rounded-full bg-sidebar-primary" />}
                    <i.icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} />
                    {!collapsed && <span className="truncate">{i.title}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <Avatar name={session.name} className="bg-sidebar-accent text-sidebar-accent-foreground" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{session.name}</p>
              <span className="mt-0.5 inline-block rounded bg-sidebar-primary/20 px-1.5 py-px text-[10px] font-semibold text-sidebar-primary">{ROLE_LABEL[session.role]}</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Link to="/account" onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs hover:bg-sidebar-accent"><UserCog className="size-3.5" /> Account</Link>
            <button onClick={() => { sessionStore.signOut(); navigate("/login" ); }} className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs hover:bg-sidebar-accent"><LogOut className="size-3.5" /> Logout</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const businesses = useCollection(db.businesses);
  const subs = useCollection(db.subscriptions);
  const tickets = useCollection(db.tickets);
  const requests = useCollection(db.requests);
  const onboarding = useCollection(db.onboarding);
  const go = (to: string) => { onOpenChange(false); navigate(to); };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search businesses, subscriptions, tickets, requests, pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">{ALL_NAV.map((n) => <CommandItem key={n.to} value={`page ${n.title}`} onSelect={() => go(n.to)}><n.icon /> {n.title}</CommandItem>)}</CommandGroup>
        <CommandGroup heading="Businesses">{businesses.map((b) => <CommandItem key={b.id} value={`${b.name} ${b.owner} ${b.id}`} onSelect={() => go("/businesses")}>{b.name}<span className="ml-auto text-xs text-muted-foreground">{b.owner}</span></CommandItem>)}</CommandGroup>
        <CommandGroup heading="Onboarding">{onboarding.map((b) => <CommandItem key={b.id} value={`${b.name} ${b.id} onboarding`} onSelect={() => go("/onboarding")}>{b.name}<span className="ml-auto text-xs text-muted-foreground">{b.stage}</span></CommandItem>)}</CommandGroup>
        <CommandGroup heading="Subscriptions">{subs.map((s) => <CommandItem key={s.id} value={`${s.id} ${s.business} ${s.plan} subscription`} onSelect={() => go("/plans")}>{s.business} · {s.plan}<span className="ml-auto font-mono text-xs text-muted-foreground">{s.id}</span></CommandItem>)}</CommandGroup>
        <CommandGroup heading="Tickets">{tickets.map((t) => <CommandItem key={t.id} value={`${t.id} ${t.subject} ${t.business}`} onSelect={() => go("/tickets")}>{t.subject}<span className="ml-auto font-mono text-xs text-muted-foreground">{t.id}</span></CommandItem>)}</CommandGroup>
        <CommandGroup heading="Requests">{requests.map((r) => <CommandItem key={r.id} value={`${r.id} ${r.subject} ${r.business}`} onSelect={() => go("/requests")}>{r.subject}<span className="ml-auto font-mono text-xs text-muted-foreground">{r.id}</span></CommandItem>)}</CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const session = useSession()!;
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifications = useCollection(db.notifications);
  const unread = notifications.filter((n) => !n.read);
  const current = ALL_NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen((o) => !o); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 transition-[width] duration-200 lg:block", collapsed ? "w-16" : "w-64")}>
        <SidebarBody collapsed={collapsed} />
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody collapsed={false} onNavigate={() => setMobile(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu /></Button>
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" aria-label="Collapse sidebar" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </Button>
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="hidden text-[11px] text-muted-foreground sm:block">
              <Link to="/dashboard" className="hover:text-foreground">Admin</Link>
              {current && <> <span className="mx-1">/</span> {current.group} <span className="mx-1">/</span> <span className="text-foreground">{current.title}</span></>}
            </nav>
            <p className="truncate text-sm font-semibold text-foreground">{current?.title ?? "Account"}</p>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground hover:border-primary/40 md:flex"
          >
            <Search className="size-4" /> Search everything…
            <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="ml-auto md:hidden" aria-label="Search" onClick={() => setSearchOpen(true)}><Search /></Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread.length} unread`}>
                <Bell />
                {unread.length > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">{unread.length}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                Notifications
                <button className="text-xs font-normal text-primary" onClick={() => notifications.forEach((n) => db.notifications.update(n.id, { read: true }))}>Mark all read</button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.slice(0, 6).map((n) => (
                <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5" onClick={() => { db.notifications.update(n.id, { read: true }); navigate(`/${n.link}`); }}>
                  <span className="flex w-full items-center gap-2 text-xs font-semibold">{!n.read && <span className="size-1.5 rounded-full bg-primary" />}{n.type}<span className="ml-auto font-normal text-muted-foreground">{relative(n.at)}</span></span>
                  <span className="text-xs text-muted-foreground">{n.message}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/notifications" className="justify-center text-xs text-primary">View all notifications</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" aria-label="Help" onClick={() => toast.info("Help centre", { description: "Press ⌘K to search. Documentation links will connect once the backend is live." })}><CircleHelp /></Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" aria-label="Profile menu">
                <Avatar name={session.name} />
                <span className="hidden text-left text-xs leading-tight xl:block">
                  <span className="block font-semibold text-foreground">{session.name}</span>
                  <span className="text-muted-foreground">{ROLE_LABEL[session.role]}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{session.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Simulate role (demo)</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={session.role} onValueChange={(v) => { sessionStore.setRole(v as Role); toast.success(`Now viewing as ${ROLE_LABEL[v as Role]}`); }}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <DropdownMenuRadioItem key={r} value={r}>{ROLE_LABEL[r]}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/account"><Settings /> Account settings</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => { sessionStore.signOut(); navigate("/login" ); }}><LogOut /> Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
