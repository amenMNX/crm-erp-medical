import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { portalLogin } from "@/lib/patient-portal-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/patient/login")({
  component: PatientLoginPage,
});

function PatientLoginPage() {
  const navigate = useNavigate();
  const [lastName, setLastName] = useState("");
  const [cin, setCin] = useState("");
  const [medicalRecordNumber, setMedicalRecordNumber] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(""); // message "email envoyé"
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const result = await portalLogin(
        lastName.trim(),
        cin.trim(),
        medicalRecordNumber.trim(),
        password.trim() || undefined
      );

      // Cas 2 : pas de password → backend a envoyé un email
      if ("detail" in result) {
        setInfo(result.detail as string);
      } else {
        // Cas 1 : connexion réussie
        navigate({ to: "/patient-portal/dashboard" });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-2xl mb-4 shadow-lg">
            CR
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Espace Patient</h1>
          <p className="text-sm text-gray-500 mt-1">Centre de Radiothérapie</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">
            Connexion à votre espace
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="last-name">Nom de famille</Label>
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
            </div>

            <div>
              <Label htmlFor="cin">CIN</Label>
              <Input
                id="cin"
                type="text"
                value={cin}
                onChange={(e) => setCin(e.target.value)}
                placeholder="12345678"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="medical-record-number">Numéro de dossier médical</Label>
              <Input
                id="medical-record-number"
                type="text"
                value={medicalRecordNumber}
                onChange={(e) => setMedicalRecordNumber(e.target.value)}
                placeholder="MRN-2026-0001"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">
                Mot de passe{" "}
                <span className="text-xs text-gray-400 font-normal">
                  (laisser vide pour recevoir un mot de passe par email)
                </span>
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="mt-1"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {info && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
                {info}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

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