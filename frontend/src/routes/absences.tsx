import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  createAbsence,
  deleteAbsence,
  fetchAbsences,
  type ApiAbsence,
} from "@/lib/absences-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/absences")({
  head: () => ({
    meta: [{ title: "Absences — Base" }],
  }),
  component: AbsencesPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: number;
  action: "enregistrée" | "supprimée";
  absence: ApiAbsence;
  timestamp: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isThisWeek(value: string) {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

// ── Dialog de création ────────────────────────────────────────────────────────

function NewAbsenceDialog({
  onCreated,
}: {
  onCreated: (absence: ApiAbsence) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee: "", date: "", motif: "" });

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });
  const employees = employeesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: createAbsence,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["absences"] });
      onCreated(created);
      toast.success("Absence enregistrée.");
      setOpen(false);
      setForm({ employee: "", date: "", motif: "" });
    },
    onError: () => toast.error("Impossible d'enregistrer l'absence."),
  });

  const valid = !!form.employee && !!form.date && !!form.motif.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Enregistrer une absence
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer une absence</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1">
            <Label>Employé *</Label>
            <Select
              value={form.employee}
              onValueChange={(v) => setForm((f) => ({ ...f, employee: v }))}
            >
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

          <div className="space-y-1">
            <Label>Date *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label>Motif *</Label>
            <Textarea
              rows={3}
              value={form.motif}
              onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
              placeholder="Maladie, absence injustifiée, événement familial…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({
                employee: Number(form.employee),
                date: form.date,
                motif: form.motif.trim(),
              })
            }
            disabled={!valid || mutation.isPending}
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

function AbsencesPage() {
  const qc = useQueryClient();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");

  const absencesQuery = useQuery({
    queryKey: ["absences"],
    queryFn: fetchAbsences,
  });

  const absences = absencesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteAbsence,
    onSuccess: (_void, id) => {
      const removed = absences.find((a) => a.id === id);
      qc.invalidateQueries({ queryKey: ["absences"] });
      if (removed) {
        setHistory((h) => [
          {
            id: Date.now(),
            action: "supprimée",
            absence: removed,
            timestamp: new Date().toISOString(),
          },
          ...h,
        ]);
      }
      toast.success("Absence supprimée.");
    },
    onError: () => toast.error("Impossible de supprimer l'absence."),
  });

  function handleCreated(absence: ApiAbsence) {
    setHistory((h) => [
      {
        id: Date.now(),
        action: "enregistrée",
        absence,
        timestamp: new Date().toISOString(),
      },
      ...h,
    ]);
  }

  // ── Dérivations ────────────────────────────────────────────────────────────
  const sorted = useMemo(
    () =>
      [...absences].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [absences]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter(
      (a) =>
        !q ||
        a.employee_name.toLowerCase().includes(q) ||
        a.motif.toLowerCase().includes(q) ||
        a.date.includes(q)
    );
  }, [sorted, query]);

  const thisWeekCount = absences.filter((a) => isThisWeek(a.date)).length;
  const deletedCount = history.filter((e) => e.action === "supprimée").length;

  const isLoading = absencesQuery.isLoading;
  const hasError = absencesQuery.isError;

  return (
    <AppShell
      title="Absences"
      actions={<NewAbsenceDialog onCreated={handleCreated} />}
    >
      <div className="space-y-4">
        {/* ── Cartes résumé ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">
                  {absences.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Total absences enregistrées
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">
                  {thisWeekCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  Cette semaine
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Trash2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">
                  {deletedCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  Supprimées cette session
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Contenu principal ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Tableau absences */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Liste des absences</CardTitle>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher employé, motif…"
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-2">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement des absences…
                </div>
              )}

              {!isLoading && hasError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Impossible de charger les absences. Veuillez actualiser la page.
                </div>
              )}

              {!isLoading && !hasError && (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Motif</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filtered.map((absence) => (
                        <TableRow key={absence.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                {initials(absence.employee_name)}
                              </div>
                              {absence.employee_name}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDate(absence.date)}
                          </TableCell>
                          <TableCell
                            className="max-w-xs truncate text-muted-foreground"
                            title={absence.motif}
                          >
                            {absence.motif}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(absence.id)}
                              title={`Supprimer l'absence de ${absence.employee_name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}

                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="h-32">
                            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                              <UserRound className="h-6 w-6" />
                              <p className="text-sm">
                                {query
                                  ? "Aucune absence ne correspond à la recherche."
                                  : "Aucune absence enregistrée."}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historique de session */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" /> Activité de la session
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[520px] space-y-3 overflow-y-auto p-4 pt-0">
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucune activité pour l'instant.
                </p>
              ) : (
                history.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={
                          entry.action === "enregistrée" ? "default" : "secondary"
                        }
                      >
                        {entry.action === "enregistrée" ? "Enregistrée" : "Supprimée"}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {entry.absence.employee_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.absence.motif} • {formatDate(entry.absence.date)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}