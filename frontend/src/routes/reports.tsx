import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Ticket,
  CheckCircle2,
  Users,
  CalendarDays,
  FileText,
  Wallet,
  Activity,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";
import { fetchTickets } from "@/lib/tickets-api";
import { fetchEmployees } from "@/lib/employees-api";
import { fetchLeaveRequests } from "@/lib/leaves-api";
import { fetchInvoices } from "@/lib/invoices-api";
import { fetchPayments } from "@/lib/payments-api";
import { fetchTreatmentSessions } from "@/lib/treatments-api";
import { fetchOutgoingPayments } from "@/lib/outgoing-payments-api";
import { fetchDashboardSummary } from "@/lib/dashboard-api";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Reports — Base" }],
  }),
  component: ReportsPage,
});

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `${num.toFixed(2)} TND` : String(value);
}

function ReportsPage() {
  const ticketsQuery   = useQuery({ queryKey: ["tickets"],            queryFn: () => fetchTickets() });
  const employeesQuery = useQuery({ queryKey: ["employees"],          queryFn: fetchEmployees });
  const leavesQuery    = useQuery({ queryKey: ["leave-requests"],     queryFn: fetchLeaveRequests });
  const invoicesQuery  = useQuery({ queryKey: ["invoices"],           queryFn: fetchInvoices });
  const paymentsQuery  = useQuery({ queryKey: ["payments"],           queryFn: () => fetchPayments() });
  const sessionsQuery  = useQuery({ queryKey: ["treatment-sessions"], queryFn: () => fetchTreatmentSessions() });
  const outgoingQuery  = useQuery({ queryKey: ["outgoing-payments"],  queryFn: fetchOutgoingPayments });
  const summaryQuery   = useQuery({ queryKey: ["dashboard-summary"],  queryFn: fetchDashboardSummary });

  const isLoading =
    ticketsQuery.isLoading || employeesQuery.isLoading || leavesQuery.isLoading ||
    invoicesQuery.isLoading || paymentsQuery.isLoading || sessionsQuery.isLoading ||
    outgoingQuery.isLoading || summaryQuery.isLoading;

  const loadError =
    ticketsQuery.error || employeesQuery.error || leavesQuery.error ||
    invoicesQuery.error || paymentsQuery.error;

  const tickets   = ticketsQuery.data   ?? [];
  const employees = employeesQuery.data ?? [];
  const leaves    = leavesQuery.data    ?? [];
  const invoices  = invoicesQuery.data  ?? [];
  const payments  = paymentsQuery.data  ?? [];
  const sessions  = sessionsQuery.data  ?? [];
  const outgoing  = outgoingQuery.data  ?? [];
  const summary   = summaryQuery.data;

  const kpis = useMemo(() => {
    const openTickets     = tickets.filter((t) => t.statut !== "Résolu" && t.statut !== "Fermé").length;
    const resolvedTickets = tickets.filter((t) => t.statut === "Résolu" || t.statut === "Fermé").length;
    const pendingLeaves   = leaves.filter((l) => l.statut === "En attente").length;
    const totalInvoiced   = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
    const totalPaid       = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalOutgoing   = outgoing.reduce((s, o) => s + Number(o.amount), 0);

    const missedSessions    = sessions.filter((s) => s.status === "missed").length;
    const completedSessions = sessions.filter((s) => s.status === "completed").length;
    const scheduledSessions = sessions.filter((s) => s.status === "scheduled").length;
    const missedRate = sessions.length > 0
      ? Math.round((missedSessions / sessions.length) * 100)
      : 0;

    return {
      openTickets, resolvedTickets, pendingLeaves,
      totalInvoiced, totalPaid, totalOutgoing,
      missedSessions, completedSessions, scheduledSessions, missedRate,
      employees: employees.length,
      invoicesCount: invoices.length,
      overdueCount: summary?.overdue_invoices_count ?? 0,
      overdueTotal: summary ? Number(summary.overdue_invoices_total) : 0,
    };
  }, [tickets, employees, leaves, invoices, payments, sessions, outgoing, summary]);

  // Recent outgoing payments table
  const recentOutgoing = useMemo(
    () => [...outgoing].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 8),
    [outgoing]
  );

  return (
    <AppShell title="Reports">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reports...
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn't load report data. Please refresh the page.
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="space-y-6">

          {/* Overdue alert */}
          {kpis.overdueCount > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>{kpis.overdueCount} facture(s) impayée(s) depuis plus de 60 jours</strong>{" "}
                — total : <strong>{formatMoney(kpis.overdueTotal)}</strong>.
              </span>
            </div>
          )}

          {/* Clinical KPIs */}
          <Card>
            <CardHeader>
              <CardTitle>Séances de traitement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  { label: "Planifiées", value: kpis.scheduledSessions, icon: Activity, tint: "text-primary bg-primary/10" },
                  { label: "Complétées", value: kpis.completedSessions, icon: CheckCircle2, tint: "text-success bg-success/10" },
                  { label: "Manquées", value: kpis.missedSessions, icon: TrendingDown, tint: kpis.missedSessions > 0 ? "text-destructive bg-destructive/10" : "text-muted-foreground bg-muted" },
                  { label: "Taux d'absence", value: `${kpis.missedRate}%`, icon: AlertTriangle, tint: kpis.missedRate > 10 ? "text-destructive bg-destructive/10" : "text-success bg-success/10" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${s.tint}`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xl font-semibold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Financial + HR KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Tickets ouverts",          value: String(kpis.openTickets),       icon: Ticket,        tint: "text-primary bg-primary/10" },
              { label: "Tickets résolus",           value: String(kpis.resolvedTickets),   icon: CheckCircle2,  tint: "text-success bg-success/10" },
              { label: "Employés",                  value: String(kpis.employees),         icon: Users,         tint: "text-info bg-info/10" },
              { label: "Congés en attente",         value: String(kpis.pendingLeaves),     icon: CalendarDays,  tint: "text-warning bg-warning/10" },
              { label: "Total facturé",             value: formatMoney(kpis.totalInvoiced), icon: FileText,     tint: "text-success bg-success/10" },
              { label: "Paiements reçus",           value: formatMoney(kpis.totalPaid),    icon: Wallet,        tint: "text-success bg-success/10" },
              { label: "Sorties de caisse (avances)", value: formatMoney(kpis.totalOutgoing), icon: Wallet,     tint: "text-destructive bg-destructive/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${s.tint}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Outgoing payments table */}
          {recentOutgoing.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Dernières sorties de caisse</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Référence</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOutgoing.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-mono text-xs">{op.reference}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{op.category_display}</Badge>
                        </TableCell>
                        <TableCell>{op.payment_date}</TableCell>
                        <TableCell className="text-muted-foreground">{op.method_display}</TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          -{formatMoney(op.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </AppShell>
  );
}