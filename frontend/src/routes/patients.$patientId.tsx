import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Edit,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
  Ticket,
  User,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  fetchPatient360,
  updatePatient,
  type ApiPatient,
  type PatientWritePayload,
} from "@/lib/patients-api";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/patients/$patientId")({
  head: () => ({
    meta: [{ title: "Dossier Patient — CRM Radiothérapie" }],
  }),
  component: PatientDossierPage,
});

// ── helpers ──────────────────────────────────────────────────────────────────

function initials(p: ApiPatient) {
  return `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase();
}

function formatMoney(v: number) {
  return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND" }).format(v);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR");
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function appointmentStatusClass(status: string) {
  if (status === "confirmed") return "bg-green-100 text-green-700 border-0";
  if (status === "scheduled") return "bg-blue-100 text-blue-700 border-0";
  if (status === "done") return "bg-muted text-muted-foreground border-0";
  if (status === "cancelled") return "bg-destructive/15 text-destructive border-0";
  return "bg-muted text-muted-foreground border-0";
}

function appointmentStatusLabel(status: string) {
  const map: Record<string, string> = {
    scheduled: "Planifié",
    confirmed: "Confirmé",
    done: "Réalisé",
    cancelled: "Annulé",
  };
  return map[status] ?? status;
}

function ticketStatusClass(statut: string) {
  if (statut === "Nouveau") return "bg-blue-100 text-blue-700 border-0";
  if (statut === "En cours") return "bg-amber-100 text-amber-700 border-0";
  if (statut === "Résolu" || statut === "Fermé") return "bg-green-100 text-green-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

function planStatusClass(status: string) {
  if (status === "active") return "bg-green-100 text-green-700 border-0";
  if (status === "draft") return "bg-amber-100 text-amber-700 border-0";
  if (status === "completed") return "bg-muted text-muted-foreground border-0";
  if (status === "cancelled") return "bg-destructive/15 text-destructive border-0";
  return "bg-muted text-muted-foreground border-0";
}

function planStatusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Brouillon",
    active: "Actif",
    completed: "Complété",
    cancelled: "Annulé",
  };
  return map[status] ?? status;
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

type EditDialogProps = {
  patient: ApiPatient;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function EditDialog({ patient, open, onClose, onSaved }: EditDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Partial<PatientWritePayload>) => updatePatient(patient.id, payload),
    onSuccess: () => {
      toast.success("Dossier mis à jour");
      onSaved();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && typeof err.data === "object" && err.data) {
        const rec = err.data as Record<string, unknown>;
        const key = Object.keys(rec)[0];
        const val = key ? rec[key] : undefined;
        setError(Array.isArray(val) ? String(val[0]) : err.message);
      } else {
        setError("Impossible de sauvegarder les modifications.");
      }
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      first_name: String(fd.get("first_name") ?? "").trim(),
      last_name: String(fd.get("last_name") ?? "").trim(),
      cin: String(fd.get("cin") ?? "").trim() || null,
      phone: String(fd.get("phone") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      birth_date: String(fd.get("birth_date") ?? "").trim() || null,
      address: String(fd.get("address") ?? "").trim(),
      diagnosis: String(fd.get("diagnosis") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Modifier le dossier patient</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="first_name">Prénom</Label>
              <Input id="first_name" name="first_name" defaultValue={patient.first_name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="last_name">Nom</Label>
              <Input id="last_name" name="last_name" defaultValue={patient.last_name} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cin">CIN</Label>
              <Input id="cin" name="cin" defaultValue={patient.cin ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="birth_date">Date de naissance</Label>
              <Input id="birth_date" name="birth_date" type="date" defaultValue={patient.birth_date ?? ""} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" name="phone" defaultValue={patient.phone} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={patient.email} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="address">Adresse</Label>
            <Input id="address" name="address" defaultValue={patient.address} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="diagnosis">Diagnostic</Label>
            <Input id="diagnosis" name="diagnosis" defaultValue={patient.diagnosis} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={patient.notes} className="resize-none" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PatientDossierPage() {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const dossierQuery = useQuery({
    queryKey: ["patient-360", patientId],
    queryFn: () => fetchPatient360(Number(patientId)),
  });

  if (dossierQuery.isLoading) {
    return (
      <AppShell title="Dossier patient">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement du dossier…
        </div>
      </AppShell>
    );
  }

  if (dossierQuery.error || !dossierQuery.data) {
    return (
      <AppShell title="Dossier patient">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger le dossier patient. Veuillez réessayer.
        </div>
      </AppShell>
    );
  }

  const { patient, active_plan, upcoming_appointments, open_tickets, finance_summary } =
    dossierQuery.data;

  const dosePercent = active_plan?.dose_percentage ?? 0;
  const doseColor =
    dosePercent >= 100
      ? "bg-destructive"
      : dosePercent >= 90
      ? "bg-amber-500"
      : "bg-primary";

  return (
    <AppShell
      title={`${patient.first_name} ${patient.last_name}`}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/patients">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Link>
          </Button>
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4" /> Modifier
          </Button>
        </div>
      }
    >
      {/* ── Header card ──────────────────────────────────────────────── */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
          <Avatar className="h-20 w-20 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
              {initials(patient)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">
                {patient.first_name} {patient.last_name}
              </h2>
              <Badge className="font-mono text-xs bg-muted text-muted-foreground border-0">
                {patient.medical_record_number}
              </Badge>
              {patient.cin && (
                <Badge variant="outline" className="text-xs">
                  CIN : {patient.cin}
                </Badge>
              )}
            </div>

            {patient.diagnosis && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Diagnostic :</span>{" "}
                {patient.diagnosis}
              </p>
            )}

            <div className="flex flex-wrap gap-4 pt-1 text-sm text-muted-foreground">
              {patient.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {patient.phone}
                </span>
              )}
              {patient.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {patient.email}
                </span>
              )}
              {patient.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {patient.address}
                </span>
              )}
              {patient.birth_date && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" /> Né(e) le {formatDate(patient.birth_date)}
                </span>
              )}
            </div>
          </div>

          <p className="shrink-0 text-xs text-muted-foreground">
            Dossier ouvert le {formatDate(patient.created_at)}
          </p>
        </CardContent>
      </Card>

      {/* ── 4 KPI cards ──────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-primary/10 p-2">
              <Stethoscope className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plan actif</p>
              <p className="text-sm font-semibold">
                {active_plan ? active_plan.name : "Aucun"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-md bg-muted p-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prochains RDV</p>
              <p className="text-xl font-semibold">{upcoming_appointments.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-none ${open_tickets.length > 0 ? "border-amber-300" : ""}`}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`rounded-md p-2 ${open_tickets.length > 0 ? "bg-amber-100" : "bg-muted"}`}>
              <Ticket className={`h-4 w-4 ${open_tickets.length > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tickets ouverts</p>
              <p className={`text-xl font-semibold ${open_tickets.length > 0 ? "text-amber-600" : ""}`}>
                {open_tickets.length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`border shadow-none ${finance_summary.balance_due > 0 ? "border-destructive/40" : ""}`}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className={`rounded-md p-2 ${finance_summary.balance_due > 0 ? "bg-destructive/10" : "bg-muted"}`}>
              <CreditCard className={`h-4 w-4 ${finance_summary.balance_due > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Solde dû</p>
              <p className={`text-xl font-semibold ${finance_summary.balance_due > 0 ? "text-destructive" : ""}`}>
                {formatMoney(finance_summary.balance_due)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main grid ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Plan de traitement actif */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              Plan de traitement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {active_plan ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{active_plan.name}</p>
                    {active_plan.protocol && (
                      <p className="text-xs text-muted-foreground">{active_plan.protocol}</p>
                    )}
                  </div>
                  <Badge className={planStatusClass(active_plan.status)}>
                    {planStatusLabel(active_plan.status)}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Séances</p>
                    <p className="text-lg font-semibold">
                      {active_plan.sessions_completed}/{active_plan.total_sessions}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Dose cumulée</p>
                    <p className={`text-lg font-semibold ${dosePercent >= 100 ? "text-destructive" : dosePercent >= 90 ? "text-amber-600" : ""}`}>
                      {active_plan.cumulative_dose} Gy
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Dose cible</p>
                    <p className="text-lg font-semibold">{active_plan.total_dose} Gy</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progression dose</span>
                    <span className={dosePercent >= 90 ? (dosePercent >= 100 ? "text-destructive font-semibold" : "text-amber-600 font-semibold") : ""}>
                      {dosePercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${doseColor}`}
                      style={{ width: `${Math.min(dosePercent, 100)}%` }}
                    />
                  </div>
                  {dosePercent >= 90 && (
                    <div className={`flex items-center gap-1 text-xs mt-1 ${dosePercent >= 100 ? "text-destructive" : "text-amber-600"}`}>
                      <AlertTriangle className="h-3 w-3" />
                      {dosePercent >= 100
                        ? "Dose totale atteinte — validation médecin requise"
                        : "Attention : 90% de la dose totale atteint"}
                    </div>
                  )}
                </div>

                <div className="flex gap-4 text-xs text-muted-foreground border-t pt-3">
                  <span>Début : {formatDate(active_plan.start_date)}</span>
                  <span>Fin prévue : {formatDate(active_plan.end_date)}</span>
                </div>

                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link to="/treatments">
                    <FileText className="h-3.5 w-3.5" /> Voir tous les plans
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted-foreground">
                <Stethoscope className="h-8 w-8 opacity-30" />
                <p>Aucun plan de traitement actif</p>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/treatments">
                    <FileText className="h-3.5 w-3.5" /> Créer un plan
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Prochains rendez-vous */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Prochains rendez-vous
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming_appointments.length > 0 ? (
              <div className="divide-y">
                {upcoming_appointments.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{apt.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(apt.appointment_date)}
                      </p>
                      {apt.reason && (
                        <p className="text-xs text-muted-foreground truncate">{apt.reason}</p>
                      )}
                    </div>
                    <Badge className={appointmentStatusClass(apt.status)}>
                      {appointmentStatusLabel(apt.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Calendar className="h-8 w-8 opacity-30" />
                <p>Aucun rendez-vous à venir</p>
              </div>
            )}

            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link to="/calendar">
                <Calendar className="h-3.5 w-3.5" /> Voir le calendrier
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Tickets ouverts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Ticket className="h-4 w-4 text-muted-foreground" />
              Tickets ouverts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {open_tickets.length > 0 ? (
              <div className="divide-y">
                {open_tickets.map((ticket) => (
                  <div key={ticket.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{ticket.numero}</span>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {ticket.priorite}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{ticket.titre}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(ticket.created_at)}</p>
                    </div>
                    <Badge className={ticketStatusClass(ticket.statut)}>{ticket.statut}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 opacity-30 text-green-500" />
                <p>Aucun ticket ouvert</p>
              </div>
            )}

            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link to="/tickets">
                <Ticket className="h-3.5 w-3.5" /> Voir tous les tickets
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Résumé financier */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Résumé financier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Total facturé</p>
                <p className="text-lg font-semibold">{formatMoney(finance_summary.total_invoiced)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Total payé</p>
                <p className="text-lg font-semibold text-green-600">
                  {formatMoney(finance_summary.total_paid)}
                </p>
              </div>
              <div className={`rounded-lg p-3 col-span-2 ${finance_summary.balance_due > 0 ? "bg-destructive/10" : "bg-muted/50"}`}>
                <p className="text-xs text-muted-foreground">Solde restant dû</p>
                <p className={`text-xl font-bold ${finance_summary.balance_due > 0 ? "text-destructive" : "text-green-600"}`}>
                  {formatMoney(finance_summary.balance_due)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Factures ouvertes</span>
              <span className="font-medium">{finance_summary.open_invoices_count}</span>
            </div>

            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/invoices">
                <FileText className="h-3.5 w-3.5" /> Voir les factures
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Notes patient */}
      {patient.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <EditDialog
        patient={patient}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["patient-360", patientId] });
          queryClient.invalidateQueries({ queryKey: ["patients"] });
        }}
      />
    </AppShell>
  );
}
