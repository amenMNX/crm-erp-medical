import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/me-api";
import { fetchMyPermissions, canViewModule } from "@/lib/permissions-api";
import { apiFetch } from "@/lib/api";
import {
  // Dashboard
  LayoutDashboard,
  // CRM - Patients & Treatments
  Users,
  ActivitySquare,
  CalendarDays,
  CalendarFold,
  Zap,
  // Support
  Ticket,
  AlertTriangle,
  MessageSquareWarning,
  MessagesSquare,
  Bell,
  // HR
  UserCog,
  UserX,
  Wallet,
  BookOpen,
  // Finance
  FileText,
  CreditCard,
  ShieldPlus,
  ArrowRightLeft,
  Coins,
  TrendingDown,
  // Stock & Équipements
  Package,
  Wrench,
  // Reports & Analytics
  BarChart3,
  FileBarChart,
  // Admin
  ShieldCheck,
  Settings,
  History,
  // Actions
  LogOut,
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
import { getAuthUser, logout } from "@/lib/auth";

// ── Route → module mapping ──────────────────────────────────────────────────
// Each item declares:
//   moduleName: the string stored in RolePermission.write_permissions
//   hasWrite:   false means "always visible to authenticated users"
//               true  means "only visible if moduleName is in user's write_permissions"

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  moduleName: string;
  hasWrite: boolean;
  adminOnly?: boolean;
};

const menuSections: { label: string; items: NavItem[] }[] = [
  {
    label: "Tableau de bord",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, moduleName: "Dashboard", hasWrite: false },
    ],
  },
  {
    label: "CRM — Patients & Traitements",
    items: [
      { title: "Patients",       url: "/patients",     icon: Users,            moduleName: "Patients",         hasWrite: true },
      { title: "Traitements",    url: "/treatments",   icon: ActivitySquare,   moduleName: "Traitements",      hasWrite: true },
      { title: "Protocoles",     url: "/protocols",    icon: Zap,              moduleName: "Protocoles",       hasWrite: true },
      { title: "Calendrier",     url: "/calendar",     icon: CalendarDays,     moduleName: "Calendrier",       hasWrite: true },
      { title: "Planning équipe",url: "/team-schedule",icon: CalendarFold,     moduleName: "Planning équipe",  hasWrite: true },
    ],
  },
  {
    label: "Support & Incidents",
    items: [
      { title: "Tickets",       url: "/tickets",       icon: Ticket,              moduleName: "Tickets",       hasWrite: true },
      { title: "Incidents",     url: "/incidents",     icon: AlertTriangle,       moduleName: "Incidents",     hasWrite: true },
      { title: "Réclamations",  url: "/complaints",    icon: MessageSquareWarning,moduleName: "Réclamations",  hasWrite: true },
      { title: "Messages",      url: "/messages",      icon: MessagesSquare,      moduleName: "Messages",      hasWrite: true },
      { title: "Notifications", url: "/notifications", icon: Bell,                moduleName: "Notifications", hasWrite: false },
    ],
  },
  {
    label: "Ressources Humaines",
    items: [
      { title: "Employés",              url: "/employees",      icon: UserCog,  moduleName: "Employés",               hasWrite: true },
      { title: "Congés",                url: "/leaves",         icon: CalendarDays, moduleName: "Congés",             hasWrite: true },
      { title: "Absences",              url: "/absences",       icon: UserX,    moduleName: "Absences",               hasWrite: true },
      { title: "Avances sur salaire",   url: "/salary-advances",icon: Wallet,   moduleName: "Avances sur salaire",    hasWrite: true },
      { title: "Formations & Compétences", url: "/formations",  icon: BookOpen, moduleName: "Formations & Compétences", hasWrite: true },
    ],
  },
  {
    label: "Comptabilité & Finances",
    items: [
      { title: "Factures",     url: "/invoices",     icon: FileText,       moduleName: "Factures",     hasWrite: true },
      { title: "Paiements",    url: "/payments",     icon: CreditCard,     moduleName: "Paiements",    hasWrite: true },
      { title: "CNAM",         url: "/cnam",         icon: ShieldPlus,     moduleName: "CNAM",         hasWrite: true },
      { title: "Abonnements",  url: "/abonnements",  icon: ArrowRightLeft, moduleName: "Abonnements",  hasWrite: true },
      { title: "Paie",         url: "/payroll",      icon: Coins,          moduleName: "Paie",         hasWrite: true },
      { title: "Recouvrement", url: "/recouvrement", icon: TrendingDown,   moduleName: "Recouvrement", hasWrite: true },
    ],
  },
  {
    label: "Stock et matériel",
    items: [
      { title: "Stocks médicaux", url: "/stocks",    icon: Package, moduleName: "Stocks médicaux", hasWrite: true },
      { title: "Équipements",     url: "/equipment", icon: Wrench,  moduleName: "Équipements",     hasWrite: true },
    ],
  },
  {
    label: "Analytique & Rapports",
    items: [
      { title: "Analytics", url: "/analytics", icon: BarChart3,    moduleName: "Analytics", hasWrite: false },
      { title: "Rapports",  url: "/reports",   icon: FileBarChart, moduleName: "Rapports",  hasWrite: false },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Rôles & Permissions", url: "/roles_permission", icon: ShieldCheck, moduleName: "Rôles & Permissions", hasWrite: false, adminOnly: true },
      { title: "Journal d'audit",     url: "/historique",       icon: History,     moduleName: "Journal d'audit",     hasWrite: false, adminOnly: true },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { title: "Paramètres", url: "/settings", icon: Settings, moduleName: "Paramètres", hasWrite: false },
    ],
  },
];

// ── Composant principal ──────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = getAuthUser();

  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ["my-permissions"],
    queryFn: fetchMyPermissions,
    enabled: true,
    staleTime: 30 * 1000,        // 30 s — matches app-shell; permissions must stay fresh
    refetchOnWindowFocus: true,
  });

  const perms = permissionsQuery.data ?? null;
  const isAdmin = perms?.is_admin ?? meQuery.data?.is_staff === true ?? false;

  // Filter sections and items based on permissions
  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        // Admin-only items (roles, audit log)
        if (item.adminOnly) return isAdmin;
        // Permission-gated items
        return canViewModule(perms, item.moduleName, item.hasWrite);
      }),
    }))
    .filter((section) => section.items.length > 0);

  async function handleLogout() {
    try {
      await apiFetch<void>("/accounts/logout/", { method: "POST" });
    } catch {
      // already expired
    } finally {
      logout();
      navigate({ to: "/signin", replace: true });
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            CM
          </div>
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
            Médical Center
          </span>
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            v1.0.0
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
                          <item.icon className="h-4 w-4" />
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
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user ? user.name.slice(0, 2).toUpperCase() : "GU"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium truncate">
              {user ? user.name : "Invité"}
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
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </SidebarMenuButton>
        </div>
        {meQuery.data?.profile?.role && (
          <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              {meQuery.data.profile.role}
            </span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}