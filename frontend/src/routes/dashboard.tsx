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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  FileText,
  DollarSign,
  Activity,
  Loader2,
  Ticket,
  UserCog,
  CalendarDays,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import { fetchInvoices, type InvoiceStatus } from "@/lib/invoices-api";
import { fetchPatients } from "@/lib/patients-api";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Base" },
      { name: "description", content: "Overview of your business performance, reports and top doctors." },
    ],
  }),
  component: DashboardPage,
});

function statusColor(status: InvoiceStatus) {
  if (status === "paid") return "bg-success/15 text-success border-0";
  if (status === "issued") return "bg-warning/15 text-warning border-0";
  if (status === "cancelled") return "bg-destructive/15 text-destructive border-0";
  return "bg-muted text-muted-foreground border-0";
}

function statusLabel(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : String(value);
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function DashboardPage() {
  const summaryQuery = useQuery({ queryKey: ["dashboard-summary"], queryFn: fetchDashboardSummary });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });

  const summary = summaryQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const isLoading = summaryQuery.isLoading || invoicesQuery.isLoading || patientsQuery.isLoading;
  const loadError = summaryQuery.error || invoicesQuery.error || patientsQuery.error;

  const monthlyRevenue = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const invoice of invoices) {
      const month = invoice.issue_date.slice(0, 7); // "YYYY-MM"
      buckets.set(month, (buckets.get(month) ?? 0) + Number(invoice.total_amount));
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, value]) => ({ name: month, value: Number(value.toFixed(2)) }));
  }, [invoices]);

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime())
        .slice(0, 5),
    [invoices],
  );

  const recentPatients = useMemo(
    () =>
      [...patients]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5),
    [patients],
  );

  const paidTotal = summary ? Number(summary.paid_total) : 0;
  const unpaidTotal = summary ? Number(summary.unpaid_total) : 0;
  const billingSplit = [
    { name: "Paid", value: paidTotal, color: "var(--chart-1)" },
    { name: "Outstanding", value: unpaidTotal, color: "var(--chart-2)" },
  ];
  const billingTotal = paidTotal + unpaidTotal;
  const paidPercent = billingTotal > 0 ? Math.round((paidTotal / billingTotal) * 100) : 0;

  const stats = summary
    ? [
        { label: "Total Patients", value: String(summary.patients_count), icon: Users, tint: "text-primary bg-primary/10" },
        { label: "Total Invoices", value: String(summary.invoices_count), icon: FileText, tint: "text-info bg-info/10" },
        { label: "Total Invoiced", value: formatMoney(summary.invoiced_total), icon: DollarSign, tint: "text-success bg-success/10" },
        { label: "Active Treatment Plans", value: String(summary.active_treatment_plans_count), icon: Activity, tint: "text-warning bg-warning/10" },
        { label: "Open Tickets", value: String(summary.open_tickets_count), icon: Ticket, tint: "text-primary bg-primary/10" },
        { label: "Resolved Tickets", value: String(summary.resolved_tickets_count), icon: Ticket, tint: "text-success bg-success/10" },
        { label: "Employees", value: String(summary.employees_count), icon: UserCog, tint: "text-info bg-info/10" },
        { label: "Pending Leave Requests", value: String(summary.pending_leave_requests_count), icon: CalendarDays, tint: "text-warning bg-warning/10" },
      ]
    : [];

  return (
    <AppShell title="Dashboard">
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard...
        </div>
      )}

      {!isLoading && loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn't load dashboard data. Please refresh the page.
        </div>
      )}

      {!isLoading && !loadError && summary && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{s.label}</p>
                      <p className="text-2xl font-semibold mt-2">{s.value}</p>
                    </div>
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${s.tint}`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Revenue by Month</CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyRevenue.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No invoices yet — chart will populate as invoices are created.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={monthlyRevenue}>
                      <defs>
                        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} stroke="var(--muted-foreground)" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => formatMoney(value)}
                      />
                      <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#fill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Paid vs Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={billingSplit} innerRadius={60} outerRadius={90} dataKey="value" stroke="none">
                        {billingSplit.map((e) => (
                          <Cell key={e.name} fill={e.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-semibold">{paidPercent}%</span>
                    <span className="text-xs text-muted-foreground">Paid</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs">
                  {billingSplit.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name} ({formatMoney(p.value)})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Invoices</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell>{invoice.patient_name}</TableCell>
                        <TableCell className="text-muted-foreground">{invoice.issue_date}</TableCell>
                        <TableCell>{formatMoney(invoice.total_amount)}</TableCell>
                        <TableCell>
                          <Badge className={statusColor(invoice.status)}>{statusLabel(invoice.status)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}

                    {recentInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                          No invoices yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Patients</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {recentPatients.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        {initials(`${p.first_name} ${p.last_name}`)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.first_name} {p.last_name}</p>
                      <p className="text-xs text-muted-foreground">{p.medical_record_number}</p>
                    </div>
                  </div>
                ))}

                {recentPatients.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No patients yet.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}