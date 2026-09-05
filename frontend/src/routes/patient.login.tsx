import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { portalLogin } from "@/lib/patient-portal-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, ArrowRight, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/patient/login")({
  component: PatientLoginPage,
});

/**
 * Two-step patient portal login:
 *
 * Step 1 — Identity only (password left blank)
 *   Patient fills last name + CIN + MRN → backend sends a one-time password
 *   to the email address on file → UI shows "check your email" state.
 *
 * Step 2 — Enter the OTP received by email
 *   The identity fields are locked (pre-filled). Patient types the OTP and
 *   submits → backend verifies → session cookie set → redirect to dashboard.
 */
function PatientLoginPage() {
  const navigate = useNavigate();

  // Identity fields — always present
  const [lastName, setLastName]                   = useState("");
  const [cin, setCin]                             = useState("");
  const [medicalRecordNumber, setMedicalRecordNumber] = useState("");

  // Password field — only active in step 2
  const [password, setPassword] = useState("");

  // UI state
  const [step, setStep]       = useState<"identity" | "otp">("identity");
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState("");
  const [loading, setLoading] = useState(false);

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const result = await portalLogin(
        lastName.trim(),
        cin.trim(),
        medicalRecordNumber.trim(),
        // no password → triggers OTP email on the backend
      );

      // Backend always returns { detail: "…" } when no password is provided
      if ("detail" in result) {
        setInfo((result as { detail: string }).detail);
        setStep("otp");
      } else {
        // Shouldn't happen on step 1, but handle gracefully
        navigate({ to: "/patient-portal/dashboard" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur de connexion.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP and log in ────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await portalLogin(
        lastName.trim(),
        cin.trim(),
        medicalRecordNumber.trim(),
        password.trim(),
      );

      if ("patient_id" in result) {
        navigate({ to: "/patient-portal/dashboard" });
      } else {
        // Backend returned a detail message (shouldn't happen on step 2)
        setError((result as { detail: string }).detail ?? "Erreur inattendue.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-2xl mb-4 shadow-lg">
            CR
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Espace Patient</h1>
          <p className="text-sm text-gray-500 mt-1">Centre de Radiothérapie</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8">

          {/* ── Step indicator ── */}
          <div className="flex items-center gap-2 mb-6">
            <StepDot active={step === "identity"} done={step === "otp"} label="1" />
            <div className="flex-1 h-px bg-gray-200" />
            <StepDot active={step === "otp"} done={false} label="2" />
          </div>

          {/* ─────────────────── STEP 1: identity ─────────────────── */}
          {step === "identity" && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Identifiez-vous
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Renseignez vos informations — un mot de passe temporaire sera
                envoyé à l'adresse e-mail de votre dossier.
              </p>

              <form onSubmit={handleRequestOtp} className="space-y-4">
                <Field label="Nom de famille" htmlFor="last-name">
                  <Input
                    id="last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mansouri"
                    autoComplete="family-name"
                    required
                    className="mt-1"
                  />
                </Field>

                <Field label="CIN" htmlFor="cin">
                  <Input
                    id="cin"
                    type="text"
                    value={cin}
                    onChange={(e) => setCin(e.target.value)}
                    placeholder="12345678"
                    required
                    className="mt-1"
                  />
                </Field>

                <Field label="Numéro de dossier médical" htmlFor="mrn">
                  <Input
                    id="mrn"
                    type="text"
                    value={medicalRecordNumber}
                    onChange={(e) => setMedicalRecordNumber(e.target.value)}
                    placeholder="MRN-2026-0001"
                    required
                    className="mt-1"
                  />
                </Field>

                {error && <ErrorBox message={error} />}

                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Mail className="h-4 w-4" />
                  {loading ? "Envoi en cours…" : "Recevoir mon mot de passe"}
                  {!loading && <ArrowRight className="h-4 w-4 ml-auto" />}
                </Button>
              </form>
            </>
          )}

          {/* ─────────────────── STEP 2: enter OTP ─────────────────── */}
          {step === "otp" && (
            <>
              <h2 className="text-lg font-semibold text-gray-800 mb-1">
                Entrez votre mot de passe
              </h2>

              {/* Info banner — what the backend confirmed */}
              {info && (
                <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4">
                  <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-blue-800">{info}</p>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-6">
                Consultez votre boîte mail et saisissez le mot de passe temporaire
                reçu. La session durera <strong>30 minutes</strong>.
              </p>

              {/* Identity recap — locked, not editable */}
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 mb-4 text-sm text-gray-600 space-y-0.5">
                <p><span className="font-medium">Nom :</span> {lastName}</p>
                <p><span className="font-medium">CIN :</span> {cin}</p>
                <p><span className="font-medium">Dossier :</span> {medicalRecordNumber}</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <Field label="Mot de passe temporaire" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    className="mt-1 tracking-widest font-mono"
                  />
                </Field>

                {error && <ErrorBox message={error} />}

                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Lock className="h-4 w-4" />
                  {loading ? "Connexion…" : "Se connecter"}
                </Button>

                <button
                  type="button"
                  onClick={() => { setStep("identity"); setError(""); setPassword(""); }}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors pt-1"
                >
                  ← Recommencer avec d'autres informations
                </button>
              </form>
            </>
          )}

          {/* Staff link */}
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-xs text-gray-400">
              Vous êtes du personnel médical ?{" "}
              <Link to="/signin" className="text-primary hover:underline">
                Accès staff
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Session sécurisée — expiration automatique après 30 min d'inactivité
        </p>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
        ${done  ? "bg-green-500 text-white"
        : active ? "bg-primary text-primary-foreground"
                 : "bg-gray-200 text-gray-500"}`}
    >
      {done ? <CheckCircle className="h-4 w-4" /> : label}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
      {message}
    </div>
  );
}