import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createPatient } from "@/lib/patients-api";

export const Route = createFileRoute("/patients/new")({
  head: () => ({
    meta: [
      { title: "Add Patient — Base" },
      { name: "description", content: "Add a new patient to your CRM." },
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
    medicalRecordNumber: "",
    cin: "",
    birthDate: "",
    address: "",
    diagnosis: "",
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const createMutation = useMutation({
    mutationFn: createPatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient added", { description: `${form.firstName} ${form.lastName}` });
      navigate({ to: "/patients" });
    },
    onError: () =>
      setFormError("Failed to add patient. Check the medical record number and CIN are unique."),
  });

  const save = () => {
    setFormError(null);

    if (!form.firstName.trim() || !form.lastName.trim() || !form.medicalRecordNumber.trim()) {
      setFormError("First name, last name, and medical record number are required.");
      return;
    }

    createMutation.mutate({
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      medical_record_number: form.medicalRecordNumber.trim(),
      cin: form.cin.trim() || null,
      birth_date: form.birthDate || null,
      address: form.address.trim(),
      diagnosis: form.diagnosis.trim(),
      notes: form.notes.trim(),
    });
  };

  return (
    <AppShell title="Add Patient">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>New Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={form.firstName} onChange={set("firstName")} placeholder="Jane" />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={form.lastName} onChange={set("lastName")} placeholder="Doe" />
              </div>
            </div>

            <div>
              <Label htmlFor="mrn">Medical Record Number</Label>
              <Input id="mrn" value={form.medicalRecordNumber} onChange={set("medicalRecordNumber")} placeholder="e.g. MRN-0042" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="jane@company.com" />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input id="phone" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cin">CIN (optional)</Label>
                <Input id="cin" value={form.cin} onChange={set("cin")} />
              </div>
              <div>
                <Label htmlFor="birthDate">Birth Date</Label>
                <Input id="birthDate" type="date" value={form.birthDate} onChange={set("birthDate")} />
              </div>
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={form.address} onChange={set("address")} rows={2} placeholder="Street, city, country" />
            </div>
            <div>
              <Label htmlFor="diagnosis">Diagnosis</Label>
              <Textarea id="diagnosis" value={form.diagnosis} onChange={set("diagnosis")} rows={2} placeholder="Optional" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} placeholder="Any relevant info..." />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => navigate({ to: "/patients" })}>Cancel</Button>
              <Button onClick={save} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Add Patient"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}