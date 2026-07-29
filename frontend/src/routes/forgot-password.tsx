import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    try {
      await apiFetch("/accounts/password-reset/", {
        method: "POST",
        body: { email },
        token: null,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send the reset link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Forgot password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your account email and we'll send you a link to reset your password.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
            If an account with that email exists, a reset link has been sent. Check your inbox.
          </div>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-sm font-medium text-foreground">Email</span>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className={buttonVariants({ variant: "default", className: "w-full py-3" })}
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/signin" className="font-medium text-primary underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
