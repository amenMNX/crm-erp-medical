import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Ticket, DollarSign, Users, Activity, Loader2 } from "lucide-react";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import { fetchInvoices } from "@/lib/invoices-api";
import { fetchTickets } from "@/lib/tickets-api";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Base" },
      { name: "description", content: "Insights, KPIs and performance analytics." },
    ],
  }),
  component: AnalyticsPage,
});

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : String(value);
}

function AnalyticsPage() {
  const summaryQuery = useQuery({ queryKey: ["dashboard-summary"], queryFn: fetchDashboardSummary });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: () => fetchTickets() });

  const summary = summaryQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];

  const isLoading = summaryQuery.isLoading || invoicesQuery.isLoading || ticketsQuery.isLoading;
  const loadError = summaryQuery.error || invoicesQuery.error || ticketsQuery.error;

  const revenueByMonth = useMemo(() => {
    const buckets = new Map<string, { revenue: number; paid: number }>();
    for (const invoice of invoices) {
      const month = invoice.issue_date.slice(0, 7);
      const entry = buckets.get(month) ?? { revenue: 0, paid: 0 };
      entry.revenue += Number(invoice.total_amount);
      if (invoice.status === "paid") entry.paid += Number(invoice.total_amount);
      buckets.set(month, entry);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-9)
      .map(([month, v]) => ({ m: month, revenue: Number(v.revenue.toFixed(2)), paid: Number(v.paid.toFixed(2)) }));
  }, [invoices]);

  const ticketsByStatus = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const t of tickets) buckets.set(t.statut, (buckets.get(t.statut) ?? 0) + 1);
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [tickets]);

  const openTickets = tickets.filter((t) => t.statut !== "Résolu" && t.statut !== "Fermé").length;

  const kpis = summary
    ? [
        { label: "Invoiced Total", value: formatMoney(summary.invoiced_total), icon: DollarSign },
        { label: "Patients", value: String(summary.patients_count), icon: Users },
        { label: "Open Tickets", value: String(openTickets), icon: Ticket },
        { label: "Active Treatment Plans", value: String(summary.active_treatment_plans_count), icon: Activity },
        { label: "Scheduled Sessions", value: String(summary.scheduled_sessions_count), icon: Activity },
        { label: "Completed Sessions", value: String(summary.completed_sessions_count), icon: Activity },
        {
          label: `Overdue Invoices (>${summary.overdue_threshold_days}d)`,
          value: String(summary.overdue_invoices_count),
          icon: DollarSign,
        },
      ]
    : [];

  return (
    <AppShell title="Analytics">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics...
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn't load analytics data. Please refresh the page.
        </div>
      )}

      {!isLoading && !loadError && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <k.icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold mt-3">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Invoiced vs Paid, by month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {revenueByMonth.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No invoices yet — chart will populate as invoices are created.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueByMonth}>
                        <defs>
                          <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="m" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip formatter={(value: number) => formatMoney(value)} />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" name="Invoiced" stroke="var(--primary)" fill="url(#v)" />
                        <Area type="monotone" dataKey="paid" name="Paid" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tickets by status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  {ticketsByStatus.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      No tickets yet.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ticketsByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" allowDecimals={false} />
                        <YAxis dataKey="name" type="category" className="text-xs" width={80} />
                        <Tooltip />
                        <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}