import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: isAuthenticated() ? "/dashboard" : "/signin", replace: true });
  }, [navigate]);

  return null;
}
