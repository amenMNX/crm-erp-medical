import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Wallet,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approvePayrollBatch,
  fetchPayrollBatches,
  generatePayroll,
  markPayrollBatchPaid,
  type ApiPayroll,
  type ApiPayrollBatch,
  type PayrollStatus,
} from "@/lib/payroll-api.ts";

export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [{ title: "Payroll — Base" }],
  }),
  component: PayrollPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: string | number) {
  const n = Number(val);
  return Number.isFinite(n) ? n.toLocaleString("fr-TN", { minimumFractionDigits: 2 }) + " TND" : String(val);
}

function statusClass(status: PayrollStatus) {
  switch (status) {
    case "paid":       return "bg-success/15 text-success border-0";
    case "approved":   return "bg-blue-500/15 text-blue-600 border-0";
    case "generated":  return "bg-warning/15 text-warning border-0";
    case "cancelled":  return "bg-destructive/15 text-destructive border-0";
    default:           return "bg-muted text-muted-foreground border-0";
  }
}

function statusLabel(status: PayrollStatus) {
  const map: Record<PayrollStatus, string> = {
    draft: "Brouillon",
    generated: "Généré",
    approved: "Approuvé",
    paid: "Payé",
    cancelled: "Annulé",
  };
  return map[status] ?? status;
}

function firstDayOfMonth(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// ── Employee row inside a batch ───────────────────────────────────────────────

function PayrollRow({ payroll }: { payroll: ApiPayroll }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded((p) => !p)}
      >
        <TableCell className="w-6">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell className="font-medium">{payroll.employee_name}</TableCell>
        <TableCell className="text-right">{fmt(payroll.base_salary)}</TableCell>
        <TableCell className="text-right">{fmt(payroll.gross_salary)}</TableCell>
        <TableCell className="text-right text-destructive">
          -{fmt(payroll.total_deductions)}
        </TableCell>
        <TableCell className="text-right font-semibold text-success">
          {fmt(payroll.net_salary)}
        </TableCell>
        <TableCell>
          <Badge className={statusClass(payroll.status)}>{statusLabel(payroll.status)}</Badge>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/30">
          <TableCell />
          <TableCell colSpan={6} className="pb-4 pt-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-muted-foreground">Salaire de base</span>
              <span className="text-right">{fmt(payroll.base_salary)}</span>

              {Number(payroll.transport_allowance) > 0 && (
                <>
                  <span className="text-muted-foreground">Indemnité transport</span>
                  <span className="text-right">{fmt(payroll.transport_allowance)}</span>
                </>
              )}
              {Number(payroll.meal_allowance) > 0 && (
                <>
                  <span className="text-muted-foreground">Indemnité repas</span>
                  <span className="text-right">{fmt(payroll.meal_allowance)}</span>
                </>
              )}
              {Number(payroll.bonus) > 0 && (
                <>
                  <span className="text-muted-foreground">Prime</span>
                  <span className="text-right">{fmt(payroll.bonus)}</span>
                </>
              )}
              {Number(payroll.overtime) > 0 && (
                <>
                  <span className="text-muted-foreground">Heures sup.</span>
                  <span className="text-right">{fmt(payroll.overtime)}</span>
                </>
              )}

              <span className="col-span-2 border-t pt-1 text-xs uppercase tracking-wide text-muted-foreground mt-1">
                Retenues
              </span>

              {Number(payroll.absence_deduction) > 0 && (
                <>
                  <span className="text-muted-foreground">Absences</span>
                  <span className="text-right text-destructive">-{fmt(payroll.absence_deduction)}</span>
                </>
              )}
              {Number(payroll.advance_deduction) > 0 && (
                <>
                  <span className="text-muted-foreground">Avance sur salaire</span>
                  <span className="text-right text-destructive">-{fmt(payroll.advance_deduction)}</span>
                </>
              )}
              {Number(payroll.tax_deduction) > 0 && (
                <>
                  <span className="text-muted-foreground">Impôt (IRPP)</span>
                  <span className="text-right text-destructive">-{fmt(payroll.tax_deduction)}</span>
                </>
              )}
              {Number(payroll.social_security) > 0 && (
                <>
                  <span className="text-muted-foreground">CNSS</span>
                  <span className="text-right text-destructive">-{fmt(payroll.social_security)}</span>
                </>
              )}

              <span className="col-span-2 border-t pt-1 font-semibold flex justify-between">
                <span>Salaire net</span>
                <span className="text-success">{fmt(payroll.net_salary)}</span>
              </span>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Batch card ────────────────────────────────────────────────────────────────

function BatchCard({ batch }: { batch: ApiPayrollBatch }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const approveMut = useMutation({
    mutationFn: () => approvePayrollBatch(batch.id),
    onSuccess: () => {
      toast.success("Paie approuvée.");
      qc.invalidateQueries({ queryKey: ["payroll-batches"] });
    },
    onError: () => toast.error("Impossible d'approuver."),
  });

  const paidMut = useMutation({
    mutationFn: () => markPayrollBatchPaid(batch.id),
    onSuccess: () => {
      toast.success("Paie marquée comme payée.");
      qc.invalidateQueries({ queryKey: ["payroll-batches"] });
    },
    onError: () => toast.error("Impossible de marquer comme payée."),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base capitalize">
              {firstDayOfMonth(batch.month)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {batch.employee_count} employé(s) · généré par {batch.generated_by_name ?? "—"}
            </p>
          </div>
          <Badge className={statusClass(batch.status)}>{statusLabel(batch.status)}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          {[
            { label: "Brut total", value: fmt(batch.total_earnings) },
            { label: "Retenues", value: fmt(batch.total_deductions) },
            { label: "Net total", value: fmt(batch.total_net_salary), bold: true },
          ].map((s) => (
            <div key={s.label} className="rounded-md border p-2.5">
              <p className={`text-sm ${s.bold ? "font-semibold text-success" : ""}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-2 flex-wrap">
          {batch.status === "generated" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveMut.mutate()}
              disabled={approveMut.isPending}
            >
              {approveMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Approuver
            </Button>
          )}
          {batch.status === "approved" && (
            <Button
              size="sm"
              onClick={() => paidMut.mutate()}
              disabled={paidMut.isPending}
            >
              {paidMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
              )}
              Marquer comme payée
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setOpen((p) => !p)}>
            {open ? "Masquer" : "Voir le détail"} ({batch.payrolls.length})
          </Button>
        </div>
      </CardHeader>

      {open && batch.payrolls.length > 0 && (
        <CardContent className="pt-0 px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <TableHead>Employé</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Brut</TableHead>
                <TableHead className="text-right">Retenues</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.payrolls.map((p) => (
                <PayrollRow key={p.id} payroll={p} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

// ── Generate dialog ───────────────────────────────────────────────────────────

function GenerateDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const mut = useMutation({
    mutationFn: () => generatePayroll(month),
    onSuccess: () => {
      toast.success("Paie générée avec succès.");
      qc.invalidateQueries({ queryKey: ["payroll-batches"] });
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message ?? "Erreur lors de la génération."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Play className="h-4 w-4 mr-2" />
          Générer la paie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Générer la paie mensuelle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Sélectionnez le mois pour lequel générer la paie. Le système calculera
            automatiquement les salaires, les retenues d'absences et les remboursements
            d'avances pour tous les employés actifs.
          </p>
          <div>
            <label className="text-sm font-medium mb-1 block">Mois (1er du mois)</label>
            <Input
              type="date"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Entrez le premier jour du mois, ex: 2026-08-01
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !month}>
            {mut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Générer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function PayrollPage() {
  const batchesQuery = useQuery({
    queryKey: ["payroll-batches"],
    queryFn: fetchPayrollBatches,
  });

  const batches = batchesQuery.data ?? [];

  const summary = useMemo(() => {
    const totalNet = batches.reduce((s, b) => s + Number(b.total_net_salary), 0);
    const paidNet = batches
      .filter((b) => b.status === "paid")
      .reduce((s, b) => s + Number(b.total_net_salary), 0);
    const pending = batches.filter(
      (b) => b.status === "generated" || b.status === "approved"
    ).length;
    return { totalNet, paidNet, pending, batchCount: batches.length };
  }, [batches]);

  return (
    <AppShell title="Paie">
      {batchesQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des données de paie…
        </div>
      )}

      {batchesQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger les données. Veuillez actualiser la page.
        </div>
      )}

      {!batchesQuery.isLoading && !batchesQuery.isError && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Total versé (paies payées)",
                value: fmt(summary.paidNet),
                sub: `${batches.filter((b) => b.status === "paid").length} batch(es)`,
              },
              {
                label: "En attente d'approbation / paiement",
                value: String(summary.pending),
                sub: "batch(es) à traiter",
              },
              {
                label: "Total paie (tous statuts)",
                value: fmt(summary.totalNet),
                sub: `${summary.batchCount} mois`,
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-5">
                  <p className="text-xl font-semibold">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Header action */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Historique des bulletins
            </h2>
            <GenerateDialog />
          </div>

          {/* Batch list */}
          {batches.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Aucune paie générée pour l'instant. Cliquez sur «&nbsp;Générer la paie&nbsp;» pour commencer.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {batches.map((b) => (
                <BatchCard key={b.id} batch={b} />
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
