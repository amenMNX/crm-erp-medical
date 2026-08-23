import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Plus, Search, TrendingDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  createDunningAction,
  fetchDunningActions,
  fetchOverdueInvoices,
  type DunningAction,
  type OverdueInvoice,
} from "@/lib/dunning-api";

export const Route = createFileRoute("/recouvrement")({
  component: RecouvrementPage,
});

const LEVEL_COLORS: Record<string, string> = {
  pre_relance: "bg-yellow-100 text-yellow-800",
  j30: "bg-orange-100 text-orange-800",
  j60: "bg-red-100 text-red-800",
  j90: "bg-red-200 text-red-900",
  huissier: "bg-purple-100 text-purple-800",
};

const LEVEL_LABELS: Record<string, string> = {
  pre_relance: "Pré-relance",
  j30: "J+30",
  j60: "J+60",
  j90: "J+90",
  huissier: "Huissier",
};

function DunningBadge({ stage }: { stage: string | null }) {
  if (!stage) return <Badge variant="outline">À jour</Badge>;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_COLORS[stage] ?? "bg-gray-100 text-gray-700"}`}>
      {LEVEL_LABELS[stage] ?? stage}
    </span>
  );
}

function RecordActionDialog({ invoices }: { invoices: OverdueInvoice[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    invoice: "",
    level: "j30" as DunningAction["level"],
    method: "email" as DunningAction["method"],
    action_date: new Date().toISOString().split("T")[0],
    fee_amount: "0.00",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: createDunningAction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dunning-actions"] });
      qc.invalidateQueries({ queryKey: ["overdue-invoices"] });
      setOpen(false);
      setForm({ invoice: "", level: "j30", method: "email", action_date: new Date().toISOString().split("T")[0], fee_amount: "0.00", notes: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Enregistrer une relance</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle action de recouvrement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Facture impayée</Label>
            <Select value={form.invoice} onValueChange={(v) => setForm((f) => ({ ...f, invoice: v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir une facture…" /></SelectTrigger>
              <SelectContent>
                {invoices.map((inv) => (
                  <SelectItem key={inv.id} value={String(inv.id)}>
                    {inv.invoice_number} — {inv.patient_name} ({inv.days_overdue}j de retard)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Palier de relance</Label>
              <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v as DunningAction["level"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="j30">Relance J+30</SelectItem>
                  <SelectItem value="j60">Relance J+60</SelectItem>
                  <SelectItem value="j90">Relance J+90</SelectItem>
                  <SelectItem value="huissier">Mise en demeure / Huissier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Méthode</Label>
              <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as DunningAction["method"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="courier">Courrier</SelectItem>
                  <SelectItem value="phone">Téléphone</SelectItem>
                  <SelectItem value="huissier">Huissier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Date d'action</Label>
              <Input type="date" value={form.action_date} onChange={(e) => setForm((f) => ({ ...f, action_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Frais (TND)</Label>
              <Input type="number" step="0.01" min="0" value={form.fee_amount} onChange={(e) => setForm((f) => ({ ...f, fee_amount: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observations, contacts, résultats…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            disabled={!form.invoice || mutation.isPending}
            onClick={() => mutation.mutate({ ...form, invoice: Number(form.invoice) as unknown as number })}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecouvrementPage() {
  const [search, setSearch] = useState("");

  const overdueQ = useQuery({
    queryKey: ["overdue-invoices"],
    queryFn: fetchOverdueInvoices,
  });

  const actionsQ = useQuery({
    queryKey: ["dunning-actions"],
    queryFn: () => fetchDunningActions(),
  });

  const overdue = overdueQ.data ?? [];
  const actions = actionsQ.data?.results ?? [];

  const filteredOverdue = overdue.filter(
    (inv) =>
      inv.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase())
  );

  const totalBalance = overdue.reduce((sum, inv) => sum + parseFloat(inv.balance_due), 0);
  const criticalCount = overdue.filter((inv) => (inv.days_overdue ?? 0) >= 90).length;

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingDown className="h-6 w-6 text-red-500" />
              Recouvrement des impayés
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Suivi des relances J+30 / J+60 / J+90 et escalades huissier
            </p>
          </div>
          <RecordActionDialog invoices={overdue} />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Factures en retard</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{overdue.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Solde total impayé</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-red-600">{totalBalance.toFixed(2)} TND</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Dossiers critiques (≥90j)</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-purple-700">{criticalCount}</p></CardContent>
          </Card>
        </div>

        {/* Overdue invoices table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Factures en retard</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher patient, facture…"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {overdueQ.isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredOverdue.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                <AlertCircle className="h-8 w-8" />
                <p>Aucune facture en retard</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facture</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Retard</TableHead>
                    <TableHead>Palier</TableHead>
                    <TableHead className="text-right">Solde dû</TableHead>
                    <TableHead className="text-right">Provision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOverdue.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell>{inv.patient_name}</TableCell>
                      <TableCell>{inv.due_date}</TableCell>
                      <TableCell>
                        <span className={`font-medium ${inv.days_overdue >= 90 ? "text-purple-700" : inv.days_overdue >= 60 ? "text-red-600" : "text-orange-600"}`}>
                          {inv.days_overdue}j
                        </span>
                      </TableCell>
                      <TableCell><DunningBadge stage={inv.dunning_stage} /></TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {parseFloat(inv.balance_due).toFixed(2)} TND
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {parseFloat(inv.doubtful_provision_amount).toFixed(2)} TND
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent actions */}
        <Card>
          <CardHeader><CardTitle>Journal des relances</CardTitle></CardHeader>
          <CardContent className="p-0">
            {actionsQ.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : actions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Aucune action enregistrée</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Palier</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead className="text-right">Frais</TableHead>
                    <TableHead>Enregistré par</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{a.action_date}</TableCell>
                      <TableCell className="font-mono text-sm">{a.invoice_number}</TableCell>
                      <TableCell>{a.patient_name}</TableCell>
                      <TableCell><DunningBadge stage={a.level} /></TableCell>
                      <TableCell className="capitalize">{a.method_display}</TableCell>
                      <TableCell className="text-right">{parseFloat(a.fee_amount).toFixed(2)} TND</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.recorded_by_name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
