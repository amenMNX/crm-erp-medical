import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/me-api";
import { apiFetch } from "@/lib/api";
import {
  LayoutDashboard,
  LayoutGrid,
  Ticket,
  MessageSquareWarning,
  MessagesSquare,
  Bell,
  UserCog,
  CalendarDays,
  UserX,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Users,
  ShieldCheck,
  ShieldPlus,
  Wallet,
  AlertTriangle,
  ArrowRightLeft,
  History,
  CalendarFold,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAuthUser, getRefreshToken, logout } from "@/lib/auth";

const routesToHideTemporarily = new Set<string>([]);

const menuSections = [
  {
    label: "Dashboard",
    items: [{ title: "Dashboard", url: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Management",
    items: [
      { title: "Board", url: "/board", icon: LayoutGrid },
      { title: "Calendar", url: "/calendar", icon: CalendarDays },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Tickets", url: "/tickets", icon: Ticket },
      { title: "Incidents", url: "/incidents", icon: AlertTriangle },
      { title: "Complaints", url: "/complaints", icon: MessageSquareWarning },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Messages", url: "/messages", icon: MessagesSquare },
    ],
  },
  {
    label: "People",
    items: [
      { title: "Employees", url: "/employees", icon: UserCog },
      { title: "Patients", url: "/patients", icon: Users },
    ],
  },
  {
    label: "Attendance",
    items: [
      { title: "Leaves", url: "/leaves", icon: CalendarDays },
      { title: "Absences", url: "/absences", icon: UserX },
    ],
  },
  {
    label: "Financial",
    items: [
      { title: "Invoices", url: "/invoices", icon: FileText },
      { title: "Payments", url: "/payments", icon: CreditCard },
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "CNAM", url: "/cnam", icon: ShieldPlus },
      { title: "Salary Advances", url: "/salary-advances", icon: Wallet },//honoraire
      { title: "Convention", url: "/abonnements", icon: ArrowRightLeft },
      //{ title: "Abonnements", url: "/abonnements", icon: ArrowRightLeft },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { title: "Schedule", url: "/schedule", icon: CalendarDays },
      { title: "Team Schedule", url: "/team-schedule", icon: CalendarFold },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Roles & Permissions", url: "/roles_permission", icon: ShieldCheck },
      { title: "Settings", url: "/settings", icon: Settings },
      { title: "Historique", url: "/historique", icon: History },
    ],
  },
]
  .map((section) => ({
    ...section,
    items: section.items.filter(({ url }) => !routesToHideTemporarily.has(url)),
  }))
  .filter((section) => section.items.length > 0);

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = getAuthUser();

  // Fetch the current user's role to conditionally show admin-only links.
  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin =
    meQuery.data?.is_staff === true ||
    meQuery.data?.profile?.role === "admin";

  // Filter out admin-only routes for non-admin users
  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter(({ url }) =>
        url === "/roles_permission" ? isAdmin : true
      ),
    }))
    .filter((section) => section.items.length > 0);

  async function handleLogout() {
    try {
      await apiFetch<void>("/accounts/logout/", {
        method: "POST",
        body: { refresh: getRefreshToken() },
      });
    } catch {
      // Clear local session even if the token is already expired or deleted server-side.
    } finally {
      logout();
      navigate({ to: "/signin", replace: true });
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            B
          </div>
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
            Base
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active =
                    pathname === item.url || pathname.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                      >
                        <Link to={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user ? user.name.slice(0, 2).toUpperCase() : "GU"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate">
              {user ? user.name : "Guest User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user ? user.email : "guest@example.com"}
            </p>
          </div>
          <SidebarMenuButton asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/10 hover:text-foreground"
              onClick={handleLogout}
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}