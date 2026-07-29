import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Ticket, CheckCircle2, Users, CalendarDays, FileText, Wallet } from "lucide-react";
import { fetchTickets } from "@/lib/tickets-api";
import { fetchEmployees } from "@/lib/employees-api";
import { fetchLeaveRequests } from "@/lib/leaves-api";
import { fetchInvoices } from "@/lib/invoices-api";
import { fetchPayments } from "@/lib/payments-api";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Reports — Base" }],
  }),
  component: ReportsPage,
});

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : String(value);
}

function ReportsPage() {
  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: fetchTickets });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const leavesQuery = useQuery({ queryKey: ["leave-requests"], queryFn: fetchLeaveRequests });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const paymentsQuery = useQuery({ queryKey: ["payments"], queryFn: () => fetchPayments() });

  const isLoading =
    ticketsQuery.isLoading || employeesQuery.isLoading || leavesQuery.isLoading || invoicesQuery.isLoading || paymentsQuery.isLoading;
  const loadError = ticketsQuery.error || employeesQuery.error || leavesQuery.error || invoicesQuery.error || paymentsQuery.error;

  const tickets = ticketsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const leaves = leavesQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const stats = useMemo(() => {
    const openTickets = tickets.filter((t) => t.statut !== "Résolu" && t.statut !== "Fermé").length;
    const resolvedTickets = tickets.filter((t) => t.statut === "Résolu" || t.statut === "Fermé").length;
    const pendingLeaves = leaves.filter((l) => l.statut === "En attente").length;
    const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.total_amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return [
      { label: "Open tickets", value: String(openTickets), icon: Ticket },
      { label: "Resolved tickets", value: String(resolvedTickets), icon: CheckCircle2 },
      { label: "Employees", value: String(employees.length), icon: Users },
      { label: "Pending leave requests", value: String(pendingLeaves), icon: CalendarDays },
      { label: "Invoices", value: `${invoices.length} · ${formatMoney(totalInvoiced)}`, icon: FileText },
      { label: "Payments received", value: formatMoney(totalPaid), icon: Wallet },
    ];
  }, [tickets, employees, leaves, invoices, payments]);

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
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tableaux de bord et reporting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                KPIs: tickets ouverts, tickets résolus, employés, congés en attente, factures et paiements — données live depuis l'API.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
