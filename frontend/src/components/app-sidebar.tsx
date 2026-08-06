import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/me-api";
import { apiFetch } from "@/lib/api";
import {
  // Dashboard
  LayoutDashboard,
  // CRM - Patients & Treatments
  Users,
  ActivitySquare,
  CalendarDays,
  CalendarFold,
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
  // Finance
  FileText,
  CreditCard,
  ShieldPlus,
  ArrowRightLeft,
  // Reports & Analytics
  BarChart3,
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

// Routes temporairement masquées (en développement)
const routesToHideTemporarily = new Set<string>([]);

// ── Structure du menu selon les modules du CDC ──────────────────────────────

const menuSections = [
  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    label: "Tableau de bord",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ],
  },

  // ── Module CRM — Gestion du Parcours Patient ─────────────────────────────
  {
    label: "CRM — Patients & Traitements",
    items: [
      { title: "Patients", url: "/patients", icon: Users },
      { title: "Traitements", url: "/treatments", icon: ActivitySquare },
      { title: "Calendrier", url: "/calendar", icon: CalendarDays },
      { title: "Planning équipe", url: "/team-schedule", icon: CalendarFold },
    ],
  },

  // ── Module CRM — Support, Tickets & Incidents ────────────────────────────
  {
    label: "Support & Incidents",
    items: [
      { title: "Tickets", url: "/tickets", icon: Ticket },
      { title: "Incidents", url: "/incidents", icon: AlertTriangle },
      { title: "Réclamations", url: "/complaints", icon: MessageSquareWarning },
      { title: "Messages", url: "/messages", icon: MessagesSquare },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },

  // ── Module RH — Gestion des Ressources Humaines ──────────────────────────
  {
    label: "Ressources Humaines",
    items: [
      { title: "Employés", url: "/employees", icon: UserCog },
      { title: "Congés", url: "/leaves", icon: CalendarDays },
      { title: "Absences", url: "/absences", icon: UserX },
      { title: "Avances sur salaire", url: "/salary-advances", icon: Wallet },
    ],
  },

  // ── Module Comptabilité — Facturation & Finances ────────────────────────
  {
    label: "Comptabilité & Finances",
    items: [
      { title: "Factures", url: "/invoices", icon: FileText },
      { title: "Paiements", url: "/payments", icon: CreditCard },
      { title: "CNAM", url: "/cnam", icon: ShieldPlus },
      { title: "Abonnements", url: "/abonnements", icon: ArrowRightLeft },
    ],
  },

  // ── Dashboard & Business Intelligence ────────────────────────────────────
  {
    label: "Analytique & Rapports",
    items: [
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Rapports", url: "/reports", icon: BarChart3 },
    ],
  },

  // ── Administration, Rôles & Sécurité ─────────────────────────────────────
  {
    label: "Administration",
    items: [
      { title: "Rôles & Permissions", url: "/roles_permission", icon: ShieldCheck },
      { title: "Journal d'audit", url: "/historique", icon: History },
    ],
  },
  {
    label: "Paramètres",
    items: [
      { title: "Paramètres", url: "/settings", icon: Settings },
    ],
  }
]
  .map((section) => ({
    ...section,
    items: section.items.filter(({ url }) => !routesToHideTemporarily.has(url)),
  }))
  .filter((section) => section.items.length > 0);

// ── Composant principal ──────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = getAuthUser();

  // Fetch current user role for conditional access
  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin =
    meQuery.data?.is_staff === true ||
    meQuery.data?.profile?.role === "admin";

  // Masquer les routes admin pour les non-admin
  const visibleSections = menuSections
    .map((section) => ({
      ...section,
      items: section.items.filter(({ url }) =>
        url === "/roles_permission" ||
        url === "/historique" ? isAdmin : true
      ),
    }))
    .filter((section) => section.items.length > 0);

  // ── Logout ──────────────────────────────────────────────────────────────────

  async function handleLogout() {
    try {
      await apiFetch<void>("/accounts/logout/", {
        method: "POST",
      });
    } catch {
      // Token already expired or removed server-side.
    } finally {
      logout();
      navigate({ to: "/signin", replace: true });
    }
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <Sidebar collapsible="icon">
      {/* Header avec logo */}
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            CR
          </div>
          <span className="text-lg font-semibold group-data-[collapsible=icon]:hidden">
            RadioThérapie
          </span>
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            v2.0
          </span>
        </div>
      </SidebarHeader>

      {/* Contenu du menu */}
      <SidebarContent>
        {visibleSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="flex items-center gap-2">
              {section.icon && <section.icon className="h-3.5 w-3.5" />}
              <span>{section.label}</span>
            </SidebarGroupLabel>
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

      {/* Footer avec utilisateur */}
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
        {/* Badge de rôle */}
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