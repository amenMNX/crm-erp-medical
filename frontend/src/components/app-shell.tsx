import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Input } from "@/components/ui/input";
import { NotificationDropdown } from "@/components/notification-dropdown";
import { fetchCurrentUser } from "@/lib/me-api";
import { isAuthenticated, login } from "@/lib/auth";

interface AppShellProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppShell({ title, actions, children }: AppShellProps) {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureAuth() {
      const hasSession = isAuthenticated();
      if (hasSession) {
        setAuthenticated(true);
        return;
      }

      try {
        const user = await fetchCurrentUser();
        login({
          id: user.id,
          username: user.username,
          name:
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username,
          email: user.email,
          role: user.profile?.role,
        });
        if (!cancelled) {
          setAuthenticated(true);
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
          navigate({ to: "/signin", replace: true });
        }
      }
    }

    ensureAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!authenticated) {
    return null;
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
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
