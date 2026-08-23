import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portalMe, portalLogout, portalUnreadCount, type PortalAuthUser } from "@/lib/patient-portal-api";
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  MessageSquare,
  Star,
  User,
  LogOut,
  Activity,
  Bell,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
 
export const Route = createFileRoute("/patient/layout")({
  component: PatientPortalLayout,
});
 
const NAV_ITEMS = [
  { label: "Tableau de bord",    href: "/patient-portal/dashboard",       icon: LayoutDashboard },
  { label: "Mes rendez-vous",    href: "/patient-portal/appointments",     icon: CalendarDays },
  { label: "Historique médical", href: "/patient-portal/medical-history",  icon: Activity },
  { label: "Mes documents",      href: "/patient-portal/documents",        icon: FileText },
  { label: "Messagerie",         href: "/patient-portal/messages",         icon: MessageSquare, badge: true },
  { label: "Mon avis",           href: "/patient-portal/rating",           icon: Star },
  { label: "Mon profil",         href: "/patient-portal/profile",          icon: User },
];
 
function PatientPortalLayout() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const [user, setUser] = useState<PortalAuthUser | null>(null);
  const [unread, setUnread] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    portalMe()
      .then((data) => {
        if (!data.authenticated) {
          navigate({ to: "/patient/login" });
          return;
        }
        setUser(data);
        setLoading(false);
      })
      .catch(() => navigate({ to: "/patient/login" }));
  }, [navigate]);
 
  useEffect(() => {
    if (!user) return;
    portalUnreadCount().then((d) => setUnread(d.unread)).catch(() => {});
    const interval = setInterval(() => {
      portalUnreadCount().then((d) => setUnread(d.unread)).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [user]);
 
  async function handleLogout() {
    await portalLogout().catch(() => {});
    navigate({ to: "/patient/login" });
  }
 
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-center">
          <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }
 
  const initials = user
    ? (user.patient_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase())
    : "PT";
 
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
 
      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r z-30 flex flex-col
          transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:z-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm">
            CR
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Espace Patient</p>
            <p className="text-xs text-gray-400">Centre de Radiothérapie</p>
          </div>
          <button
            className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
 
        {/* Patient info */}
        <div className="px-5 py-4 border-b bg-blue-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.patient_name}</p>
              <p className="text-xs text-gray-400">MRN: {user?.mrn}</p>
            </div>
          </div>
        </div>
 
        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? "bg-primary text-primary-foreground"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}
                `}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge && unread > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-primary text-primary-foreground"}`}>
                    {unread}
                  </span>
                )}
                {active && <ChevronRight className="h-3 w-3 opacity-60" />}
              </Link>
            );
          })}
        </nav>
 
        {/* Footer */}
        <div className="border-t px-3 py-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>
 
      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-white border-b px-4 py-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-700">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-800 text-sm">Espace Patient</span>
          {unread > 0 && (
            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unread}
            </span>
          )}
        </header>
 
        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}