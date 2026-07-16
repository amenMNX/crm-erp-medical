import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { isAuthenticated, login } from "@/lib/auth";

export const Route = createFileRoute("/signin")({
  component: SigninPage,
});

type LoginResponse = {
  token :string ;
};

type  CurrentUserResponse = {
  username: string;
  email: string;
  first_name : string;
  last_name : string ;
}


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

    try {
      const { token } = await apiFetch<LoginResponse>("/accounts/login/", {
        method: "POST",
        body: { username, password },
        token: null,
      });

      const user = await apiFetch<CurrentUserResponse>("/accounts/me/", {
        token,
      });

      login(
        {
          name: `${user.first_name} ${user.last_name}`.trim() || user.username,
          email: user.email || user.username,
        },
        token,
      );

      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your dashboard and continue managing your workspace.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
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
              placeholder="admin"
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
              placeholder="********"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className={buttonVariants({ variant: "default", className: "w-full py-3" })}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Need an account?{" "}
          <Link to="/signup" className="font-medium text-primary underline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}