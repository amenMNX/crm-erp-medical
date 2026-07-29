import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Plus, Search } from "lucide-react";
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
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/abonnements")({
  component: AbonnementsPage,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type SubscriptionPlan = {
  id: number;
  name: string;
  description: string;
  monthly_price: string;
  is_active: boolean;
};

type SubscriptionChange = {
  id: number;
  patient: number;
  patient_name: string;
  previous_plan: number | null;
  previous_plan_name: string | null;
  new_plan: number | null;
  new_plan_name: string | null;
  reason: string;
  notes: string;
  effective_date: string;
  recorded_by_name: string | null;
  created_at: string;
};

type ApiPatient = { id: number; first_name: string; last_name: string };

type Paginated<T> = { results: T[]; count: number } | T[];
function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

const REASONS = [
  { value: "initial", label: "Abonnement initial" },
  { value: "upgrade", label: "Upgrade" },
  { value: "downgrade", label: "Downgrade" },
  { value: "cancellation", label: "Résiliation" },
  { value: "reactivation", label: "Réactivation" },
  { value: "other", label: "Autre" },
] as const;

// ─── API helpers ─────────────────────────────────────────────────────────────

function fetchPlans(): Promise<SubscriptionPlan[]> {
  return apiFetch<Paginated<SubscriptionPlan>>("/accounting/subscription-plans/").then(unwrap);
}

function fetchChanges(): Promise<SubscriptionChange[]> {
  return apiFetch<Paginated<SubscriptionChange>>("/accounting/subscription-changes/").then(unwrap);
}

function fetchPatients(): Promise<ApiPatient[]> {
  return apiFetch<Paginated<ApiPatient>>("/crm/patients/").then(unwrap);
}

function createPlan(payload: { name: string; description: string; monthly_price: string }): Promise<SubscriptionPlan> {
  return apiFetch("/accounting/subscription-plans/", { method: "POST", body: payload });
}

function createChange(payload: {
  patient: number;
  previous_plan?: number | null;
  new_plan: number;
  reason: string;
  notes: string;
  effective_date: string;
}): Promise<SubscriptionChange> {
  return apiFetch("/accounting/subscription-changes/", { method: "POST", body: payload });
}

// ─── Page ────────────────────────────────────────────────────────────────────

function AbonnementsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [openPlan, setOpenPlan] = useState(false);
  const [openChange, setOpenChange] = useState(false);

  const plansQuery = useQuery({ queryKey: ["subscription-plans"], queryFn: fetchPlans });
  const changesQuery = useQuery({ queryKey: ["subscription-changes"], queryFn: fetchChanges });
  const patientsQuery = useQuery({ queryKey: ["patients-select"], queryFn: fetchPatients });

  const plans = plansQuery.data ?? [];
  const changes = changesQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const addPlanMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      setOpenPlan(false);
    },
  });

  const addChangeMutation = useMutation({
    mutationFn: createChange,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-changes"] });
      setOpenChange(false);
    },
  });

  const filteredChanges = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return changes;
    return changes.filter(
      (c) =>
        c.patient_name.toLowerCase().includes(q) ||
        (c.new_plan_name ?? "").toLowerCase().includes(q) ||
        (c.previous_plan_name ?? "").toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q),
    );
  }, [changes, query]);

  function handleAddPlan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addPlanMutation.mutate({
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim(),
      monthly_price: String(fd.get("monthly_price") ?? "0"),
    });
  }

  function handleAddChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const patientId = Number(fd.get("patient"));
    const newPlanId = Number(fd.get("new_plan"));
    const prevPlanId = fd.get("previous_plan") ? Number(fd.get("previous_plan")) : null;
    addChangeMutation.mutate({
      patient: patientId,
      previous_plan: prevPlanId || null,
      new_plan: newPlanId,
      reason: String(fd.get("reason") ?? "other"),
      notes: String(fd.get("notes") ?? "").trim(),
      effective_date: String(fd.get("effective_date") ?? ""),
    });
  }

  const isLoading = plansQuery.isLoading || changesQuery.isLoading;

  return (
    <AppShell
      title="Abonnements"
      actions={
        <div className="flex gap-2">
          {/* Add plan */}
          <Dialog open={openPlan} onOpenChange={setOpenPlan}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4" /> Nouveau forfait
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddPlan} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Créer un forfait</DialogTitle>
                </DialogHeader>
                <Input name="name" placeholder="Nom du forfait" required />
                <Textarea name="description" placeholder="Description" rows={2} />
                <Input name="monthly_price" type="number" step="0.01" min="0" placeholder="Prix mensuel (DT)" required />
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setOpenPlan(false)}>Annuler</Button>
                  <Button type="submit" disabled={addPlanMutation.isPending}>
                    {addPlanMutation.isPending ? "Création…" : "Créer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Record change */}
          <Dialog open={openChange} onOpenChange={setOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <ArrowRightLeft className="h-4 w-4" /> Changement d'abonnement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddChange} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Enregistrer un changement d'abonnement</DialogTitle>
                </DialogHeader>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Patient</label>
                  <Select name="patient" required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un patient" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Forfait précédent (optionnel)</label>
                  <Select name="previous_plan">
                    <SelectTrigger><SelectValue placeholder="Aucun (premier abonnement)" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Nouveau forfait</label>
                  <Select name="new_plan" required>
                    <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Motif</label>
                  <Select name="reason" required>
                    <SelectTrigger><SelectValue placeholder="Motif du changement" /></SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Date d'effet</label>
                  <Input name="effective_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>

                <Textarea name="notes" placeholder="Notes (optionnel)" rows={2} />

                {addChangeMutation.isError && (
                  <p className="text-sm text-destructive">Erreur lors de l'enregistrement.</p>
                )}

                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setOpenChange(false)}>Annuler</Button>
                  <Button type="submit" disabled={addChangeMutation.isPending}>
                    {addChangeMutation.isPending ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="grid gap-6">
        {/* Plans summary cards */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Forfaits disponibles</h2>
          {plansQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun forfait défini. Créez-en un avec le bouton ci-dessus.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} className={plan.is_active ? "" : "opacity-50"}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="flex items-center justify-between text-base">
                      {plan.name}
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Actif" : "Inactif"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {plan.description && (
                      <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>
                    )}
                    <p className="text-lg font-semibold">{Number(plan.monthly_price).toFixed(2)} DT<span className="text-sm font-normal text-muted-foreground"> / mois</span></p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Change history table */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Historique des changements</h2>
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="pl-9"
                />
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
                </div>
              )}

              {!isLoading && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>Forfait précédent</TableHead>
                        <TableHead>Nouveau forfait</TableHead>
                        <TableHead>Motif</TableHead>
                        <TableHead>Date d'effet</TableHead>
                        <TableHead>Enregistré par</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredChanges.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.patient_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.previous_plan_name ?? <span className="italic">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{c.new_plan_name ?? "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            {REASONS.find((r) => r.value === c.reason)?.label ?? c.reason}
                          </TableCell>
                          <TableCell>{new Date(c.effective_date).toLocaleDateString("fr-FR")}</TableCell>
                          <TableCell className="text-muted-foreground">{c.recorded_by_name ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filteredChanges.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                            Aucun changement enregistré.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}