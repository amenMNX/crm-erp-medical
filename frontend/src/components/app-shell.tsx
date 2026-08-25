import type { ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Input } from "@/components/ui/input";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { fetchCurrentUser } from "@/lib/me-api";
import { fetchMyPermissions, canViewModule } from "@/lib/permissions-api";
import { login } from "@/lib/auth";

// ── Route → module map ───────────────────────────────────────────────────────
const ROUTE_MODULE_MAP: Record<string, { moduleName: string; hasWrite: boolean; adminOnly?: boolean }> = {
  "/dashboard":       { moduleName: "Dashboard",                hasWrite: false },
  "/patients":        { moduleName: "Patients",                 hasWrite: true  },
  "/treatments":      { moduleName: "Traitements",              hasWrite: true  },
  "/protocols":       { moduleName: "Protocoles",               hasWrite: true  },
  "/calendar":        { moduleName: "Calendrier",               hasWrite: true  },
  "/team-schedule":   { moduleName: "Planning équipe",          hasWrite: true  },
  "/tickets":         { moduleName: "Tickets",                  hasWrite: true  },
  "/incidents":       { moduleName: "Incidents",                hasWrite: true  },
  "/complaints":      { moduleName: "Réclamations",             hasWrite: true  },
  "/messages":        { moduleName: "Messages",                 hasWrite: true  },
  "/notifications":   { moduleName: "Notifications",            hasWrite: false },
  "/employees":       { moduleName: "Employés",                 hasWrite: true  },
  "/leaves":          { moduleName: "Congés",                   hasWrite: true  },
  "/absences":        { moduleName: "Absences",                 hasWrite: true  },
  "/salary-advances": { moduleName: "Avances sur salaire",      hasWrite: true  },
  "/formations":      { moduleName: "Formations & Compétences", hasWrite: true  },
  "/invoices":        { moduleName: "Factures",                 hasWrite: true  },
  "/payments":        { moduleName: "Paiements",                hasWrite: true  },
  "/cnam":            { moduleName: "CNAM",                     hasWrite: true  },
  "/abonnements":     { moduleName: "Abonnements",              hasWrite: true  },
  "/payroll":         { moduleName: "Paie",                     hasWrite: true  },
  "/recouvrement":    { moduleName: "Recouvrement",             hasWrite: true  },
  "/stocks":          { moduleName: "Stocks médicaux",          hasWrite: true  },
  "/equipment":       { moduleName: "Équipements",              hasWrite: true  },
  "/analytics":       { moduleName: "Analytics",                hasWrite: false },
  "/reports":         { moduleName: "Rapports",                 hasWrite: false },
  "/roles_permission":{ moduleName: "Rôles & Permissions",      hasWrite: false, adminOnly: true },
  "/historique":      { moduleName: "Journal d'audit",          hasWrite: false, adminOnly: true },
  "/settings":        { moduleName: "Paramètres",               hasWrite: false },
};

function resolveRoute(pathname: string) {
  if (ROUTE_MODULE_MAP[pathname]) return ROUTE_MODULE_MAP[pathname];
  const match = Object.keys(ROUTE_MODULE_MAP)
    .filter((p) => p !== "/" && pathname.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_MODULE_MAP[match] : null;
}

interface AppShellProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, actions, children }: AppShellProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Use React Query for auth check — hits cache on subsequent navigations, no waterfall
  const meQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const user = await fetchCurrentUser();
      // Keep auth store in sync
      login({
        id: user.id,
        username: user.username,
        name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username,
        email: user.email,
        role: user.profile?.role,
      });
      return user;
    },
    staleTime: 5 * 60 * 1000,   // 5 min — don't re-check auth on every click
    retry: false,
  });

  // Fetch permissions — enabled as soon as me/ resolves.
  // staleTime is intentionally short: permissions can change when an admin
  // edits a role in the Roles & Permissions page, and we want the affected
  // user to pick up the change within one navigation, not after 5 minutes.
  const permissionsQuery = useQuery({
    queryKey: ["my-permissions"],
    queryFn: fetchMyPermissions,
    enabled: meQuery.isSuccess,
    staleTime: 30 * 1000,        // 30 seconds — balance freshness vs. API calls
    refetchOnWindowFocus: true,  // re-validate when user switches back to tab
    retry: false,
  });

  // Redirect to login on auth failure
  if (meQuery.isError) {
    navigate({ to: "/signin", replace: true });
    return null;
  }

  // Show nothing while the very first auth check runs (no flash)
  if (meQuery.isLoading) return null;

  // Enforce route access
  const perms = permissionsQuery.data ?? null;
  const permissionsLoaded = permissionsQuery.isSuccess || permissionsQuery.isError;
  const routeInfo = resolveRoute(pathname);

  let accessGranted = true;
  if (permissionsLoaded && perms && routeInfo) {
    if (routeInfo.adminOnly) {
      accessGranted = perms.is_admin;
    } else {
      accessGranted = canViewModule(perms, routeInfo.moduleName, routeInfo.hasWrite);
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/40">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-4 border-b bg-background px-4 md:px-6 sticky top-0 z-30">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold truncate">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-9 w-64 bg-muted/50 border-0" />
              </div>
              <NotificationDropdown />
              {actions}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            {permissionsLoaded && !accessGranted ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Accès refusé</h2>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Vous n'avez pas la permission d'accéder à cette page.
                    Contactez un administrateur pour modifier vos droits.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard", replace: true })}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Retour au tableau de bord
                </button>
              </div>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}