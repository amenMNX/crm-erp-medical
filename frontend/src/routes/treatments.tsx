import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivitySquare,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Search,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchAllPatients } from "@/lib/patients-api";
import {
  createTreatmentPlan,
  createTreatmentSession,
  deleteTreatmentPlan,
  deleteTreatmentSession,
  fetchTreatmentPlans,
  fetchTreatmentSessions,
  updateTreatmentPlan,
  updateTreatmentSession,
  isConflictWarning,
  fetchMachines,
  fetchRooms,
  type ApiMachine,
  type ApiRoom,
  type ApiTreatmentPlan,
  type ApiTreatmentSession,
  type ConflictWarning,
  type TreatmentPlanStatus,
  type TreatmentSessionStatus,
} from "@/lib/treatments-api";

export const Route = createFileRoute("/treatments")({
  head: () => ({
    meta: [
      { title: "Traitements — Base" },
      { name: "description", content: "Plans de traitement et séances de radiothérapie." },
    ],
  }),
  component: TreatmentsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const PLAN_STATUS_LABELS: Record<TreatmentPlanStatus, string> = {
  draft: "Brouillon",
  active: "Actif",
  completed: "Terminé",
  cancelled: "Annulé",
};

const SESSION_STATUS_LABELS: Record<TreatmentSessionStatus, string> = {
  scheduled: "Planifiée",
  in_progress: "En cours",
  completed: "Complétée",
  cancelled: "Annulée",
  missed: "Manquée",
};

function planStatusBadge(status: TreatmentPlanStatus) {
  const label = PLAN_STATUS_LABELS[status];
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-0">{label}</Badge>;
  if (status === "draft") return <Badge className="bg-amber-100 text-amber-700 border-0">{label}</Badge>;
  if (status === "completed") return <Badge className="bg-blue-100 text-blue-700 border-0">{label}</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-0">{label}</Badge>;
}

function sessionStatusBadge(status: TreatmentSessionStatus) {
  const label = SESSION_STATUS_LABELS[status];
  if (status === "completed") return <Badge className="bg-green-100 text-green-700 border-0">{label}</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-100 text-blue-700 border-0">{label}</Badge>;
  if (status === "scheduled") return <Badge className="bg-amber-100 text-amber-700 border-0">{label}</Badge>;
  if (status === "missed") return <Badge className="bg-red-100 text-red-700 border-0">{label}</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-0">{label}</Badge>;
}

/** Color the dose progress bar based on how close we are to the limit. */
function doseAlertLevel(pct: number): "ok" | "warning" | "danger" {
  if (pct >= 100) return "danger";
  if (pct >= 90) return "warning";
  return "ok";
}

function DoseProgress({ plan }: { plan: ApiTreatmentPlan }) {
  const pct = plan.dose_percentage ?? 0;
  const level = doseAlertLevel(pct);
  const color =
    level === "danger"
      ? "bg-red-500"
      : level === "warning"
        ? "bg-amber-400"
        : "bg-green-500";

  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {plan.cumulative_dose.toFixed(1)} / {Number(plan.total_dose).toFixed(1)} Gy
        </span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {level === "danger" && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <XCircle className="h-3 w-3" /> Dose dépassée — validation médecin requise
        </p>
      )}
      {level === "warning" && (
        <p className="text-xs text-amber-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Dose ≥ 90% — vigilance requise
        </p>
      )}
    </div>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────

function PlansTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<ApiTreatmentPlan | null>(null);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [name, setName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [protocol, setProtocol] = useState("");
  const [totalSessions, setTotalSessions] = useState("1");
  const [dosePerSession, setDosePerSession] = useState("0");
  const [totalDose, setTotalDose] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [planStatus, setPlanStatus] = useState<TreatmentPlanStatus>("draft");
  const [notes, setNotes] = useState("");

  const plansQuery = useQuery({
    queryKey: ["treatment-plans"],
    queryFn: () => fetchTreatmentPlans(),
  });
  const patientsQuery = useQuery({
    queryKey: ["patients-all"],
    queryFn: fetchAllPatients,
  });

  const plans = plansQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createTreatmentPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Plan de traitement créé");
      setOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message || "Erreur lors de la création"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<typeof createMutation.variables> }) =>
      updateTreatmentPlan(id, payload as Parameters<typeof updateTreatmentPlan>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Plan mis à jour");
      setOpen(false);
      setEditPlan(null);
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message || "Erreur lors de la mise à jour"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTreatmentPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Plan supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  function resetForm() {
    setPatientId("");
    setName("");
    setDiagnosis("");
    setProtocol("");
    setTotalSessions("1");
    setDosePerSession("0");
    setTotalDose("0");
    setStartDate("");
    setEndDate("");
    setPlanStatus("draft");
    setNotes("");
  }

  function openEdit(plan: ApiTreatmentPlan) {
    setEditPlan(plan);
    setPatientId(String(plan.patient));
    setName(plan.name);
    setDiagnosis(plan.diagnosis);
    setProtocol(plan.protocol);
    setTotalSessions(String(plan.total_sessions));
    setDosePerSession(String(plan.dose_per_session));
    setTotalDose(String(plan.total_dose));
    setStartDate(plan.start_date ?? "");
    setEndDate(plan.end_date ?? "");
    setPlanStatus(plan.status);
    setNotes(plan.notes);
    setOpen(true);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      patient: Number(patientId),
      name,
      diagnosis,
      protocol,
      total_sessions: Number(totalSessions),
      dose_per_session: Number(dosePerSession),
      total_dose: Number(totalDose),
      start_date: startDate || null,
      end_date: endDate || null,
      status: planStatus,
      notes,
    };
    if (editPlan) {
      updateMutation.mutate({ id: editPlan.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plans.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.patient_name.toLowerCase().includes(q) ||
        p.diagnosis.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchQ && matchStatus;
    });
  }, [plans, query, statusFilter]);

  // Summary KPIs
  const activePlans = plans.filter((p) => p.status === "active").length;
  const draftPlans = plans.filter((p) => p.status === "draft").length;
  const nearLimit = plans.filter((p) => p.dose_percentage >= 90 && p.status === "active").length;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total plans</p>
            <p className="text-2xl font-bold">{plans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Actifs</p>
            <p className="text-2xl font-bold text-green-600">{activePlans}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Brouillons</p>
            <p className="text-2xl font-bold text-amber-500">{draftPlans}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Dose ≥ 90%</p>
              <p className="text-2xl font-bold text-red-600">{nearLimit}</p>
            </div>
            {nearLimit > 0 && (
              <AlertTriangle className="h-4 w-4 text-red-500 mt-1 shrink-0" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters + Action */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un plan ou patient…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="completed">Terminé</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>

        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditPlan(null);
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nouveau plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editPlan ? "Modifier le plan de traitement" : "Créer un plan de traitement"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {/* Patient */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Patient *</label>
                <Select value={patientId} onValueChange={setPatientId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un patient…" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name} ({p.medical_record_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nom du plan */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Nom du plan *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex. Protocole IMRT Sein G"
                  required
                />
              </div>

              {/* Diagnostic */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Diagnostic</label>
                <Input
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="ex. Cancer du sein stade II"
                />
              </div>

              {/* Protocole */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Protocole</label>
                <Textarea
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  placeholder="Description du protocole thérapeutique…"
                  rows={2}
                />
              </div>

              {/* Dose grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nb séances *</label>
                  <Input
                    type="number"
                    min="1"
                    value={totalSessions}
                    onChange={(e) => setTotalSessions(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Dose/séance (Gy) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dosePerSession}
                    onChange={(e) => setDosePerSession(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Dose totale (Gy) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={totalDose}
                    onChange={(e) => setTotalDose(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date début</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date fin prévue</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Statut (edit only — doctors activate plans) */}
              {editPlan && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Statut</label>
                  <Select
                    value={planStatus}
                    onValueChange={(v) => setPlanStatus(v as TreatmentPlanStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Brouillon</SelectItem>
                      <SelectItem value="active">Actif</SelectItem>
                      <SelectItem value="completed">Terminé</SelectItem>
                      <SelectItem value="cancelled">Annulé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations complémentaires…"
                  rows={2}
                />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isPending || !patientId || !name}>
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editPlan ? "Enregistrer" : "Créer le plan"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {plansQuery.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <ActivitySquare className="h-8 w-8" />
              <p className="text-sm">Aucun plan de traitement trouvé</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Séances</TableHead>
                  <TableHead>Dose cumulée</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((plan) => (
                  <TableRow
                    key={plan.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(plan)}
                  >
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {plan.patient_name}
                    </TableCell>
                    <TableCell>{planStatusBadge(plan.status)}</TableCell>
                    <TableCell className="text-sm">
                      {plan.sessions_completed} / {plan.total_sessions}
                    </TableCell>
                    <TableCell className="min-w-[160px]">
                      <DoseProgress plan={plan} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {plan.start_date
                        ? new Date(plan.start_date).toLocaleDateString("fr-FR")
                        : "—"}
                      {plan.end_date &&
                        ` → ${new Date(plan.end_date).toLocaleDateString("fr-FR")}`}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Supprimer ce plan de traitement ?")) {
                            deleteMutation.mutate(plan.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sessions Tab ──────────────────────────────────────────────────────────────

function SessionsTab() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editSession, setEditSession] = useState<ApiTreatmentSession | null>(null);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [sessionNumber, setSessionNumber] = useState("1");
  const [scheduledDatetime, setScheduledDatetime] = useState("");
  const [actualDatetime, setActualDatetime] = useState("");
  const [sessionStatus, setSessionStatus] = useState<TreatmentSessionStatus>("scheduled");
  const [machine, setMachine] = useState("");
  const [room, setRoom] = useState("");
  const [doseDelivered, setDoseDelivered] = useState("0");
  const [notes, setNotes] = useState("");
  const [doseError, setDoseError] = useState<string | null>(null);

  // Conflict detection state (US-TRT-04)
  const [conflictWarning, setConflictWarning] = useState<ConflictWarning | null>(null);
  // Stores the payload that triggered the conflict so we can re-send with force=true
  const [pendingPayload, setPendingPayload] = useState<Parameters<typeof createTreatmentSession>[0] | null>(null);
  const [pendingEditId, setPendingEditId] = useState<number | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["treatment-sessions"],
    queryFn: () => fetchTreatmentSessions(),
  });
  const plansQuery = useQuery({
    queryKey: ["treatment-plans"],
    queryFn: () => fetchTreatmentPlans(),
  });
  const patientsQuery = useQuery({
    queryKey: ["patients-all"],
    queryFn: fetchAllPatients,
  });

  const sessions = sessionsQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const { data: machines = [] } = useQuery<ApiMachine[]>({
    queryKey: ["machines"],
    queryFn: fetchMachines,
  });
  const { data: rooms = [] } = useQuery<ApiRoom[]>({
    queryKey: ["rooms"],
    queryFn: fetchRooms,
  });

  // Filter plans by selected patient
  const filteredPlans = useMemo(
    () => (patientId ? plans.filter((p) => String(p.patient) === patientId) : plans),
    [plans, patientId],
  );

  // Dose safety check (client-side preview — backend also enforces)
  const selectedPlan = useMemo(
    () => plans.find((p) => String(p.id) === planId),
    [plans, planId],
  );

  const dosePreviewLevel = useMemo(() => {
    if (!selectedPlan || !doseDelivered) return null;
    const base = editSession
      ? selectedPlan.cumulative_dose - Number(editSession.dose_delivered)
      : selectedPlan.cumulative_dose;
    const next = base + Number(doseDelivered);
    const ratio = next / Number(selectedPlan.total_dose);
    if (ratio > 1) return "danger";
    if (ratio >= 0.9) return "warning";
    return null;
  }, [selectedPlan, doseDelivered, editSession]);

  const createMutation = useMutation({
    mutationFn: createTreatmentSession,
    onSuccess: (result) => {
      if (isConflictWarning(result)) {
        // Store the payload so the conflict dialog can re-send with force=true
        setPendingEditId(null);
        setConflictWarning(result);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["treatment-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Séance enregistrée");
      setOpen(false);
      resetForm();
      setPendingPayload(null);
    },
    onError: (err: Error) => {
      const msg = err.message || "Erreur";
      if (msg.includes("dose_delivered") || msg.includes("BLOCAGE") || msg.includes("ALERTE")) {
        setDoseError(msg);
      } else {
        toast.error(msg);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTreatmentSession>[1] }) =>
      updateTreatmentSession(id, payload),
    onSuccess: (result) => {
      if (isConflictWarning(result)) {
        setPendingEditId(pendingEditId);
        setConflictWarning(result);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["treatment-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Séance mise à jour");
      setOpen(false);
      setEditSession(null);
      resetForm();
      setPendingPayload(null);
      setPendingEditId(null);
    },
    onError: (err: Error) => {
      const msg = err.message || "Erreur";
      if (msg.includes("dose_delivered") || msg.includes("BLOCAGE") || msg.includes("ALERTE")) {
        setDoseError(msg);
      } else {
        toast.error(msg);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTreatmentSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatment-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["treatment-plans"] });
      toast.success("Séance supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  function resetForm() {
    setPatientId("");
    setPlanId("");
    setSessionNumber("1");
    setScheduledDatetime("");
    setActualDatetime("");
    setSessionStatus("scheduled");
    setMachine("");
    setRoom("");
    setDoseDelivered("0");
    setNotes("");
    setDoseError(null);
  }

  function openEdit(session: ApiTreatmentSession) {
    setEditSession(session);
    setPatientId(String(session.patient));
    setPlanId(String(session.treatment_plan));
    setSessionNumber(String(session.session_number));
    setScheduledDatetime(session.scheduled_datetime.slice(0, 16));
    setActualDatetime(session.actual_datetime?.slice(0, 16) ?? "");
    setSessionStatus(session.status);
    setMachine(session.machine !== null ? String(session.machine) : "");
    setRoom(session.room !== null ? String(session.room) : "");
    setDoseDelivered(String(session.dose_delivered));
    setNotes(session.notes);
    setDoseError(null);
    setOpen(true);
  }

  function setNow() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setActualDatetime(local);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setDoseError(null);
    const payload = {
      patient: Number(patientId),
      treatment_plan: Number(planId),
      session_number: Number(sessionNumber),
      scheduled_datetime: scheduledDatetime
        ? new Date(scheduledDatetime).toISOString()
        : new Date().toISOString(),
      actual_datetime: actualDatetime ? new Date(actualDatetime).toISOString() : null,
      status: sessionStatus,
      machine: machine ? Number(machine) : null,
      room: room ? Number(room) : null,
      dose_delivered: Number(doseDelivered),
      notes,
    };
    // Store the payload so we can re-fire with force=true if the user confirms a conflict
    setPendingPayload(payload);
    if (editSession) {
      setPendingEditId(editSession.id);
      updateMutation.mutate({ id: editSession.id, payload });
    } else {
      setPendingEditId(null);
      createMutation.mutate(payload);
    }
  }

  /** Called when the user clicks "Confirmer quand même" in the conflict dialog. */
  function handleForceConfirm() {
    if (!pendingPayload) return;
    const forcedPayload = { ...pendingPayload, force: true };
    if (pendingEditId !== null) {
      updateMutation.mutate({ id: pendingEditId, payload: forcedPayload });
    } else {
      createMutation.mutate(forcedPayload);
    }
    setConflictWarning(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchQ =
        !q ||
        s.patient_name.toLowerCase().includes(q) ||
        s.treatment_plan_name.toLowerCase().includes(q) ||
        (s.machine_name ?? "").toLowerCase().includes(q) ||
        (s.room_name ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || s.status === statusFilter;
      return matchQ && matchStatus;
    });
  }, [sessions, query, statusFilter]);

  // KPIs
  const today = new Date().toDateString();
  const todaySessions = sessions.filter(
    (s) => new Date(s.scheduled_datetime).toDateString() === today,
  ).length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const missed = sessions.filter((s) => s.status === "missed").length;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      {/* ── Conflict Warning Dialog (US-TRT-04) ── */}
      {conflictWarning && (
        <Dialog open onOpenChange={() => setConflictWarning(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                Conflit de ressource détecté
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <p className="text-muted-foreground">{conflictWarning.message}</p>
              <div className="rounded-md border divide-y">
                {conflictWarning.conflicts.map((c) => (
                  <div key={c.id} className="px-3 py-2 space-y-0.5">
                    <p className="font-medium">{c.patient_name}</p>
                    <p className="text-muted-foreground text-xs">
                      {new Date(c.scheduled_datetime).toLocaleString("fr-FR")}
                      {" · "}
                      {c.conflict_type === "machine_and_room"
                        ? `Machine & Salle : ${c.machine} / ${c.room}`
                        : c.conflict_type === "machine"
                          ? `Machine : ${c.machine}`
                          : `Salle : ${c.room}`}
                    </p>
                  </div>
                ))}
              </div>
              {conflictWarning.alternative_slots.length > 0 && (
                <div>
                  <p className="font-medium mb-1">Créneaux disponibles alternatifs :</p>
                  <div className="flex flex-wrap gap-2">
                    {conflictWarning.alternative_slots.map((slot) => (
                      <span
                        key={slot}
                        className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                      >
                        {new Date(slot).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConflictWarning(null)}>
                Modifier le créneau
              </Button>
              <Button
                variant="destructive"
                onClick={handleForceConfirm}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Confirmer quand même
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Séances totales</p>
            <p className="text-2xl font-bold">{sessions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Aujourd'hui
            </p>
            <p className="text-2xl font-bold text-blue-600">{todaySessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Complétées
            </p>
            <p className="text-2xl font-bold text-green-600">{completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3" /> Manquées
            </p>
            <p className="text-2xl font-bold text-red-600">{missed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Action */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher patient, machine, salle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="scheduled">Planifiée</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="completed">Complétée</SelectItem>
            <SelectItem value="missed">Manquée</SelectItem>
            <SelectItem value="cancelled">Annulée</SelectItem>
          </SelectContent>
        </Select>

        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditSession(null);
              resetForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nouvelle séance
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editSession ? "Modifier la séance" : "Enregistrer une séance"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {/* Patient */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Patient *</label>
                <Select
                  value={patientId}
                  onValueChange={(v) => {
                    setPatientId(v);
                    setPlanId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un patient…" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name} ({p.medical_record_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plan */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Plan de traitement *</label>
                <Select value={planId} onValueChange={setPlanId} disabled={!patientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un plan…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPlans.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} ({PLAN_STATUS_LABELS[p.status]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <p className="text-xs text-muted-foreground">
                    Dose prescrite : {Number(selectedPlan.total_dose).toFixed(1)} Gy —
                    cumulé : {selectedPlan.cumulative_dose.toFixed(1)} Gy (
                    {selectedPlan.dose_percentage.toFixed(0)}%)
                  </p>
                )}
              </div>

              {/* Session number + datetime */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">N° séance *</label>
                  <Input
                    type="number"
                    min="1"
                    value={sessionNumber}
                    onChange={(e) => setSessionNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Date planifiée *</label>
                  <Input
                    type="datetime-local"
                    value={scheduledDatetime}
                    onChange={(e) => setScheduledDatetime(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Actual datetime */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Date/heure réelle</label>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={actualDatetime}
                    onChange={(e) => setActualDatetime(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={setNow}>
                    <Clock className="h-4 w-4 mr-1" /> Maintenant
                  </Button>
                </div>
              </div>

              {/* Machine + Room */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Machine</label>
                  <Select value={machine} onValueChange={setMachine}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une machine…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Aucune —</SelectItem>
                      {machines
                        .filter((m) => m.status === "active")
                        .map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Salle</label>
                  <Select value={room} onValueChange={setRoom}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une salle…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Aucune —</SelectItem>
                      {rooms
                        .filter((r) => r.status === "active")
                        .map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dose delivered */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Dose délivrée (Gy)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={doseDelivered}
                  onChange={(e) => {
                    setDoseDelivered(e.target.value);
                    setDoseError(null);
                  }}
                />
                {/* Client-side dose preview alert */}
                {dosePreviewLevel === "danger" && (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      La dose cumulée dépasserait la dose totale prescrite. Un médecin
                      doit valider l'exception avant d'enregistrer.
                    </span>
                  </div>
                )}
                {dosePreviewLevel === "warning" && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Alerte 90% : la dose cumulée atteindra ≥ 90% de la dose prescrite.
                      Vérifiez avec le médecin responsable.
                    </span>
                  </div>
                )}
                {doseError && (
                  <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{doseError}</span>
                  </div>
                )}
              </div>

              {/* Statut */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Statut</label>
                <Select
                  value={sessionStatus}
                  onValueChange={(v) => setSessionStatus(v as TreatmentSessionStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Planifiée</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="completed">Complétée</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                    <SelectItem value="missed">Manquée</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Observations</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observations cliniques, incidents…"
                  rows={2}
                />
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isPending || !patientId || !planId}
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editSession ? "Enregistrer" : "Créer la séance"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardContent className="p-0">
          {sessionsQuery.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Zap className="h-8 w-8" />
              <p className="text-sm">Aucune séance trouvée</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Date planifiée</TableHead>
                  <TableHead>Machine / Salle</TableHead>
                  <TableHead>Dose (Gy)</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((session) => (
                  <TableRow
                    key={session.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openEdit(session)}
                  >
                    <TableCell className="font-mono text-sm">
                      #{session.session_number}
                    </TableCell>
                    <TableCell className="text-sm">{session.patient_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {session.treatment_plan_name}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(session.scheduled_datetime).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {session.machine_name || "—"}
                      {session.room_name && (
                        <span className="text-muted-foreground"> / {session.room_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {Number(session.dose_delivered).toFixed(2)}
                    </TableCell>
                    <TableCell>{sessionStatusBadge(session.status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Supprimer cette séance ?")) {
                            deleteMutation.mutate(session.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function TreatmentsPage() {
  return (
    <AppShell title="Traitements">
      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <ActivitySquare className="h-4 w-4" /> Plans de traitement
          </TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <Zap className="h-4 w-4" /> Séances
          </TabsTrigger>
        </TabsList>
        <TabsContent value="plans">
          <PlansTab />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}