import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchCurrentUser } from "@/lib/me-api";
import { isAuthenticated, login } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (isAuthenticated()) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      try {
        const user = await fetchCurrentUser();
        if (cancelled) return;

        login({
          id: user.id,
          username: user.username,
          name:
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username,
          email: user.email,
          role: user.profile?.role,
        });
        navigate({ to: "/dashboard", replace: true });
      } catch {
        if (!cancelled) {
          navigate({ to: "/signin", replace: true });
        }
      } finally {
        if (!cancelled) {
          setChecked(true);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return checked ? null : null;
}
