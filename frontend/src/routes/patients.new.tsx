import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createPatient, type ApiPatient } from "@/lib/patients-api";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/patients/new")({
  head: () => ({
    meta: [
      { title: "Nouveau patient — CRM Radiothérapie" },
      { name: "description", content: "Enregistrer un nouveau patient." },
    ],
  }),
  component: AddPatientPage,
});

function AddPatientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    cin: "",
    birthDate: "",
    address: "",
    diagnosis: "",
    notes: "",
  });

  const [formError, setFormError] = useState<string | null>(null);
  // Show the generated MRN after successful creation before redirecting
  const [createdPatient, setCreatedPatient] = useState<ApiPatient | null>(null);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: createPatient,
    onSuccess: (patient) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setCreatedPatient(patient);
      toast.success("Patient enregistré", {
        description: `MRN attribué : ${patient.medical_record_number}`,
      });
      // Short delay so the user sees the MRN before the redirect
      setTimeout(() => navigate({ to: "/patients" }), 1800);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setFormError(
          typeof err.data === "object" && err.data !== null
            ? Object.values(err.data as Record<string, string[]>)
                .flat()
                .join(" · ")
            : err.message,
        );
      } else {
        setFormError("Échec de l'enregistrement. Vérifiez que le CIN est unique.");
      }
    },
  });

  const save = () => {
    setFormError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError("Le prénom et le nom sont obligatoires.");
      return;
    }
    if (!form.phone.trim()) {
      setFormError("Le numéro de téléphone est obligatoire.");
      return;
    }
    // MRN is NOT sent — the backend generates it automatically.
    createMutation.mutate({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      cin: form.cin.trim() || null,
      birth_date: form.birthDate || null,
      address: form.address.trim(),
      diagnosis: form.diagnosis.trim(),
      notes: form.notes.trim(),
    });
  };

  return (
    <AppShell title="Nouveau patient">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Nouveau patient
              <Badge variant="outline" className="text-xs font-normal">
                MRN attribué automatiquement
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            {createdPatient && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <span>✓ Patient créé —</span>
                <span className="font-mono font-semibold">
                  {createdPatient.medical_record_number}
                </span>
                <span className="text-muted-foreground">Redirection en cours…</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">
                  Prénom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={set("firstName")}
                  placeholder="Prénom"
                />
              </div>
              <div>
                <Label htmlFor="lastName">
                  Nom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={set("lastName")}
                  placeholder="Nom de famille"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">
                  Téléphone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+216 XX XXX XXX"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="patient@exemple.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cin">CIN (optionnel)</Label>
                <Input id="cin" value={form.cin} onChange={set("cin")} placeholder="12345678" />
              </div>
              <div>
                <Label htmlFor="birthDate">Date de naissance</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={set("birthDate")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Adresse</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={set("address")}
                rows={2}
                placeholder="Rue, ville, code postal"
              />
            </div>

            <div>
              <Label htmlFor="diagnosis">Diagnostic initial</Label>
              <Textarea
                id="diagnosis"
                value={form.diagnosis}
                onChange={set("diagnosis")}
                rows={2}
                placeholder="Optionnel — peut être complété plus tard"
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={set("notes")}
                rows={3}
                placeholder="Informations complémentaires…"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => navigate({ to: "/patients" })}>
                Annuler
              </Button>
              <Button
                onClick={save}
                disabled={createMutation.isPending || !!createdPatient}
              >
                {createMutation.isPending ? "Enregistrement…" : "Créer le patient"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}