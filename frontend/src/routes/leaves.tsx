import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Loader2, Plus, Search, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveLeaveRequest,
  createLeaveRequest,
  fetchLeaveRequests,
  rejectLeaveRequest,
  type LeaveStatus,
} from "@/lib/leaves-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/leaves")({
  head: () => ({
    meta: [{ title: "Congés — Base" }],
  }),
  component: LeavesPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LeaveStatus, string> = {
  "En attente": "En attente",
  "Acceptée": "Acceptée",
  "Refusée": "Refusée",
};

function statusClass(status: LeaveStatus) {
  if (status === "Acceptée")  return "bg-success/15 text-success border-0";
  if (status === "Refusée")   return "bg-destructive/15 text-destructive border-0";
  return "bg-warning/15 text-warning border-0";
}

function formatDays(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Dialoge de création ───────────────────────────────────────────────────────

function NewLeaveDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee: "",
    date_debut: "",
    date_fin: "",
    motif: "",
    notes: "",
  });

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const employees = employeesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Demande de congé soumise.");
      setOpen(false);
      setForm({ employee: "", date_debut: "", date_fin: "", motif: "", notes: "" });
    },
    onError: () => toast.error("Impossible de soumettre la demande."),
  });

  const valid =
    !!form.employee && !!form.date_debut && !!form.date_fin && !!form.motif &&
    form.date_fin >= form.date_debut;

  function handleSubmit() {
    if (!valid) return;
    mutation.mutate({
      employee: Number(form.employee),
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      motif: form.motif,
      notes: form.notes,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle demande
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Demande de congé</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label>Employé *</Label>
            <Select value={form.employee} onValueChange={(v) => setForm((f) => ({ ...f, employee: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un employé…" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={String(emp.id)}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date de début *</Label>
              <Input
                type="date"
                value={form.date_debut}
                onChange={(e) => setForm((f) => ({ ...f, date_debut: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Date de fin *</Label>
              <Input
                type="date"
                value={form.date_fin}
                min={form.date_debut || undefined}
                onChange={(e) => setForm((f) => ({ ...f, date_fin: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Motif *</Label>
            <Input
              value={form.motif}
              onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
              placeholder="Congé annuel, congé maladie…"
            />
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-muted-foreground text-xs">(optionnel)</span></Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Informations complémentaires…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Soumettre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

const ALL_STATUSES: LeaveStatus[] = ["En attente", "Acceptée", "Refusée"];

function LeavesPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");

  const leavesQuery   = useQuery({ queryKey: ["leaves"],    queryFn: fetchLeaveRequests });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const leaves    = leavesQuery.data    ?? [];
  const employees = employeesQuery.data ?? [];

  const approveMut = useMutation({
    mutationFn: approveLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Congé approuvé.");
    },
    onError: () => toast.error("Impossible d'approuver."),
  });

  const rejectMut = useMutation({
    mutationFn: rejectLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Congé refusé.");
    },
    onError: () => toast.error("Impossible de refuser."),
  });

  // ── Statistiques résumées ──────────────────────────────────────────────────
  const acceptedLeaves = leaves.filter((l) => l.statut === "Acceptée");
  const pendingLeaves  = leaves.filter((l) => l.statut === "En attente");
  const acceptedDays   = acceptedLeaves.reduce((s, l) => s + Number(l.duration_days ?? 0), 0);
  const totalRemaining = employees.reduce((s, e) => s + Number(e.leave_days_remaining ?? 0), 0);

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leaves.filter((l) => {
      const matchText =
        !q ||
        l.employee_name.toLowerCase().includes(q) ||
        l.motif.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || l.statut === statusFilter;
      return matchText && matchStatus;
    });
  }, [leaves, query, statusFilter]);

  const isLoading = leavesQuery.isLoading || employeesQuery.isLoading;
  const hasError  = leavesQuery.isError   || employeesQuery.isError;

  return (
    <AppShell title="Congés" actions={<NewLeaveDialog />}>
      {/* ── Cartes résumé ── */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {[
          {
            icon: <CalendarDays className="h-5 w-5" />,
            label: "Congés approuvés",
            value: acceptedLeaves.length,
            color: "bg-success/10 text-success",
          },
          {
            icon: <CalendarDays className="h-5 w-5" />,
            label: "Jours pris (acceptés)",
            value: `${formatDays(acceptedDays)} j`,
            color: "bg-primary/10 text-primary",
          },
          {
            icon: <CalendarDays className="h-5 w-5" />,
            label: "Crédit restant (total)",
            value: `${formatDays(totalRemaining)} j`,
            color: "bg-warning/10 text-warning",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
                {s.icon}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filtres ── */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par employé ou motif…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Indicateur en attente ── */}
          {pendingLeaves.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
              {pendingLeaves.length} demande{pendingLeaves.length > 1 ? "s" : ""} en attente de décision.
            </div>
          )}

          {/* ── États chargement / erreur ── */}
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des congés…
            </div>
          )}

          {!isLoading && hasError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Impossible de charger les données. Veuillez actualiser la page.
            </div>
          )}

          {/* ── Tableau ── */}
          {!isLoading && !hasError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employé</TableHead>
                    <TableHead>Début</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead className="text-right">Durée</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead className="text-right">Crédit restant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-24 text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">{leave.employee_name}</TableCell>
                      <TableCell className="text-sm">{formatDate(leave.date_debut)}</TableCell>
                      <TableCell className="text-sm">{formatDate(leave.date_fin)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {formatDays(leave.duration_days)} j
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm" title={leave.motif}>
                        {leave.motif}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatDays(leave.employee_leave_days_remaining)} j
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClass(leave.statut)}>
                          {STATUS_LABELS[leave.statut]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {leave.statut === "En attente" ? (
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={approveMut.isPending}
                              onClick={() => approveMut.mutate(leave.id)}
                              title="Approuver"
                            >
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={rejectMut.isPending}
                              onClick={() => rejectMut.mutate(leave.id)}
                              title="Refuser"
                            >
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-center text-xs text-muted-foreground">—</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        Aucune demande de congé trouvée.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}