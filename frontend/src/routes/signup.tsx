import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

type SignupResponse = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
};

function SignupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    // Validation
    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      setIsSubmitting(false);
      return;
    }

    if (!username) {
      setError("Username is required.");
      setIsSubmitting(false);
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Try multiple common registration endpoints
      let response;
      const endpoints = [
        "/auth/register/",
        "/accounts/register/",
        "/api/auth/register/",
        "/users/register/",
      ];

      let lastError: Error | null = null;

      for (const endpoint of endpoints) {
        try {
          response = await apiFetch<SignupResponse>(endpoint, {
            method: "POST",
            body: {
              first_name: firstName,
              last_name: lastName,
              username,
              email,
              password,
            },
            token: null,
          });
          break; // Success, exit loop
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          continue; // Try next endpoint
        }
      }

      if (!response) {
        throw lastError || new Error("Registration failed");
      }

      setSuccessMessage(
        "Account created successfully! Please sign in with your credentials."
      );
      
      // Clear form after successful registration
      event.currentTarget.reset();
      
      // Optionally redirect to signin after 2 seconds
      setTimeout(() => {
        navigate({ to: "/signin", replace: true });
      }, 2000);
      
    } catch (err) {
      console.error("Registration error:", err);
      
      if (err instanceof ApiError) {
        // Show detailed error from API
        const errorMessage = err.message || err.details || "Unable to create account.";
        setError(errorMessage);
      } else {
        setError("Unable to create account. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Create account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign up to get started with your workspace.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">First name</span>
              <input
                name="first_name"
                type="text"
                placeholder="John"
                autoComplete="given-name"
                required
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-foreground">Last name</span>
              <input
                name="last_name"
                type="text"
                placeholder="Doe"
                autoComplete="family-name"
                required
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

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
            <span className="text-sm font-medium text-foreground">Email</span>
            <input
              name="email"
              type="email"
              placeholder="john@example.com"
              autoComplete="email"
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
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Confirm password</span>
            <input
              name="confirm_password"
              type="password"
              placeholder="********"
              autoComplete="new-password"
              required
              minLength={8}
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className={buttonVariants({ variant: "default", className: "w-full py-3" })}
          >
            {isSubmitting ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/signin" className="font-medium text-primary underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}