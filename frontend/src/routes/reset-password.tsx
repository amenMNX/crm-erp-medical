import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { uid, token } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { uid: params.get("uid") ?? "", token: params.get("token") ?? "" };
  }, []);

  const linkIsValid = Boolean(uid && token);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("new_password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch("/accounts/password-reset/confirm/", {
        method: "POST",
        body: { uid, token, new_password: newPassword },
        token: null,
      });
      setDone(true);
      setTimeout(() => navigate({ to: "/signin", replace: true }), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Reset password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a new password for your account.</p>
        </div>

        {!linkIsValid ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            This reset link is missing or malformed. Please request a new one.
          </div>
        ) : done ? (
          <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            Your password has been reset. Redirecting to sign in...
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-foreground">New password</span>
              <input
                name="new_password"
                type="password"
                placeholder="********"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Confirm new password</span>
              <input
                name="confirm_password"
                type="password"
                placeholder="********"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className={buttonVariants({ variant: "default", className: "w-full py-3" })}
            >
              {isSubmitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/signin" className="font-medium text-primary underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
