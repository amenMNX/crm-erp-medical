import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Account required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            User accounts are created by an administrator. Ask your system administrator to create
            an account for you, then sign in with your username and password.
          </p>
        </div>

        <Link
          to="/signin"
          className={buttonVariants({ variant: "default", className: "w-full py-3" })}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}