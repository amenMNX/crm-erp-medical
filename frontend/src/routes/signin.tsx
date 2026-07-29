import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { isAuthenticated, login } from "@/lib/auth";

export const Route = createFileRoute("/signin")({
  component: SigninPage,
});

type LoginResponse = {
  access: string;
  refresh: string;
};

type MeResponse = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
};

function SigninPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!username) {
      setError("Username is required.");
      setIsSubmitting(false);
      return;
    }

    if (!password) {
      setError("Password is required.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Step 1: get the auth token
      const tokenResponse = await apiFetch<LoginResponse>("/accounts/login/", {
        method: "POST",
        body: { username, password },
        token: null,
      });

      // Step 2: fetch the current user's profile so we can store their name/email
      const meResponse = await apiFetch<MeResponse>("/accounts/me/", {
        token: tokenResponse.access,
      });

      // Step 3: persist both in localStorage via auth helpers
      login(
          {
            name: [meResponse.first_name, meResponse.last_name].filter(Boolean).join(" ") || meResponse.username,
            email: meResponse.email,
          },
          tokenResponse.access,
          tokenResponse.refresh,
        );

      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Invalid username or password.");
      } else {
        setError("Unable to sign in. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Welcome back — enter your credentials to continue.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-foreground">Username</span>
            <input
              name="username"
              type="text"
              placeholder="johndoe"
              autoComplete="username"
              required
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Password</span>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={buttonVariants({ variant: "default", className: "w-full py-3" })}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="font-medium text-primary underline">
            Create one
          </Link>
        </div>

        <div className="mt-2 text-center text-sm text-muted-foreground">
          <Link to="/portal" className="font-medium text-primary underline">
            Patient portal — no account needed
          </Link>
        </div>
      </div>
    </div>
  );
}