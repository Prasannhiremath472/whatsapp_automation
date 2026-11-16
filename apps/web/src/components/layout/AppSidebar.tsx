import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, LogOut, MessageCircle, Plus, User, CreditCard } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth";
import { toast } from "sonner";
import { useState } from "react";
import { mainNav, businessNav, developerNav, secondaryNav, type NavItem } from "./nav";


function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title} className="h-9 font-medium">
        <Link to={item.url} onClick={() => setOpenMobile(false)}>
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge && <SidebarMenuBadge className="bg-primary-soft text-primary">{item.badge}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const path = location.pathname;
  const { tenant } = useSession();
  const navigate=useNavigate();
  const workspace = tenant.name;
  const isActive = (url: string) => (url === "/" ? path === "/" : path.startsWith(url));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageCircle className="h-4 w-4" />
          </div>
          <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Genie
          </span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-11 border bg-background" tooltip={workspace}>
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-semibold text-background">
                    {workspace[0]}
                  </div>
                  <div className="flex min-w-0 flex-col text-left leading-tight">
                    <span className="truncate text-[11px] text-muted-foreground">Workspace</span>
                    <span className="truncate text-sm font-medium">{workspace}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
                <DropdownMenuItem disabled>
                  <span className="flex-1">{workspace}</span>
                  <Check className="h-4 w-4 text-primary" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainNav.map((item) => (
                <NavLink key={item.url} item={item} active={isActive(item.url)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {[{label:'Business management',items:businessNav},{label:'Developer console',items:developerNav}].map(group=><SidebarGroup key={group.label}><SidebarGroupLabel>{group.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu className="gap-0.5">{group.items.map(item=><NavLink key={item.url} item={item} active={isActive(item.url)}/>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}
      </SidebarContent>

      <SidebarFooter className="gap-2 p-3">
        <div className="rounded-lg border bg-primary-soft/60 p-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Demo workspace
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">+1 202 555 0100 · fictional</p>
        </div>
        <SidebarMenu className="gap-0.5">
          {secondaryNav.map((item) => (
            <NavLink key={item.url} item={item} active={isActive(item.url)} />
          ))}
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-11" tooltip="Admin">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">AP</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col text-left leading-tight">
                    <span className="truncate text-sm font-medium">Admin</span>
                    <span className="truncate text-[11px] text-muted-foreground">Owner</span>
                  </div>
                  <ChevronsUpDown className="ml-auto h-4 w-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm">Admin</div>
                  <div className="text-xs font-normal text-muted-foreground">admin@brightminds.example</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={()=>navigate("/profile")}><User className="h-4 w-4" /> Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={()=>navigate("/settings")}><CreditCard className="h-4 w-4" /> Billing</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={()=>toast.info("Demo workspace — no account is signed in.")} className="text-destructive"><LogOut className="h-4 w-4" /> Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
