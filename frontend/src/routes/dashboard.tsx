// /tmp/project/src/routes/dashboard.tsx
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
  AlertTriangle,
  Clock,
  CreditCard,
  Stethoscope,
  Briefcase,
  ShieldCheck,
  UserPlus,
  CheckCircle2,
  XCircle,
  Building2,
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
  BarChart,
  Bar,
} from "recharts";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import { fetchInvoices, type InvoiceStatus } from "@/lib/invoices-api";
import { fetchAllPatients } from "@/lib/patients-api";
import { fetchCurrentUser } from "@/lib/me-api";

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
  const map: Record<InvoiceStatus, string> = {
    draft: "Brouillon",
    issued: "Émise",
    paid: "Payée",
    cancelled: "Annulée",
  };
  return map[status] ?? status;
}

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num.toLocaleString("fr-TN", { minimumFractionDigits: 2 }) + " TND" : String(value);
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function DashboardPage() {
  // ── Auth check first — all data queries wait for the user to resolve ──────
  // This prevents dashboard sub-queries from firing before the JWT cookie is
  // refreshed, which was causing 401s on /api/dashboard/summary/ at page load.
  const userQuery = useQuery({ queryKey: ["me"], queryFn: fetchCurrentUser });
  const isAuthed = userQuery.isSuccess;

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: fetchDashboardSummary,
    enabled: isAuthed,
  });
  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: fetchInvoices,
    enabled: isAuthed,
  });
  const patientsQuery = useQuery({
    queryKey: ["patients-all"],
    queryFn: fetchAllPatients,
    enabled: isAuthed,
  });

  const user = userQuery.data;
  const summary = summaryQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const role = user?.profile?.role ?? "unknown";
  const isAdmin = role === "admin";
  const isFinance = role === "accountant" || role === "admin";
  const isMedical = role === "doctor" || role === "admin";
  const isSupport = role === "agent" || role === "support" || role === "admin";
  const isHR = role === "hr" || role === "admin";

  const overdueCount = summary?.overdue_invoices_count ?? 0;
  const overdueTotal = summary?.overdue_invoices_total ?? 0;
  const overdueDays = summary?.overdue_threshold_days ?? 0;

  const isLoading = userQuery.isLoading || summaryQuery.isLoading || invoicesQuery.isLoading || patientsQuery.isLoading;
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

  const paidTotal = summary ? Number(summary.paid_total ?? 0) : 0;
  const unpaidTotal = summary ? Number(summary.unpaid_total ?? 0) : 0;
  const billingSplit = [
    { name: "Payé", value: paidTotal, color: "#22c55e" },
    { name: "Impayé", value: unpaidTotal, color: "#ef4444" },
  ];
  const billingTotal = paidTotal + unpaidTotal;
  const paidPercent = billingTotal > 0 ? Math.round((paidTotal / billingTotal) * 100) : 0;

  if (isLoading) {
    return (
      <AppShell title="Dashboard">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du dashboard...
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell title="Dashboard">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger les données du dashboard. Veuillez actualiser la page.
        </div>
      </AppShell>
    );
  }

  if (!summary) {
    return (
      <AppShell title="Dashboard">
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Aucune donnée disponible.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      <div className="space-y-6">
        {/* Role-based greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Bonjour, {user?.first_name || user?.username || "Utilisateur"} 👋
            </h2>
            <p className="text-sm text-muted-foreground">
              Rôle : {role} · Vue personnalisée
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </Badge>
        </div>

        {/* Overdue invoices alert banner (only for finance/admin) */}
        {isFinance && overdueCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>{overdueCount} facture(s) impayée(s)</strong> depuis plus de {overdueDays} jours — montant total : <strong>{formatMoney(overdueTotal)}</strong>. Vérifiez la liste des factures pour relancer les patients.
            </span>
          </div>
        )}

        {/* Stats - Role specific */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isAdmin && (
            <>
              <StatCard
                label="Patients actifs"
                value={summary.patients_count}
                icon={Users}
                color="blue"
              />
              <StatCard
                label="Employés actifs"
                value={summary.active_employees ?? summary.employees_count}
                icon={Briefcase}
                color="purple"
              />
              <StatCard
                label="Plans de traitement actifs"
                value={summary.active_treatment_plans_count ?? 0}
                icon={Building2}
                color="teal"
              />
              <StatCard
                label="Tickets ouverts"
                value={summary.open_tickets_count ?? 0}
                icon={Ticket}
                color="yellow"
              />
            </>
          )}

          {isFinance && !isAdmin && (
            <>
              <StatCard
                label="Chiffre d'affaires"
                value={formatMoney(summary.paid_total ?? 0)}
                icon={DollarSign}
                color="green"
              />
              <StatCard
                label="Factures impayées"
                value={summary.unpaid_invoices_count ?? 0}
                icon={CreditCard}
                color="red"
              />
              <StatCard
                label="CNAM en attente"
                value={summary.cnam_pending_count ?? 0}
                icon={ShieldCheck}
                color="orange"
              />
              <StatCard
                label="Factures émises"
                value={summary.invoices_count ?? 0}
                icon={FileText}
                color="blue"
              />
            </>
          )}

          {isMedical && !isAdmin && (
            <>
              <StatCard
                label="Plans actifs"
                value={summary.active_treatment_plans_count ?? 0}
                icon={Stethoscope}
                color="teal"
              />
              <StatCard
                label="Séances aujourd'hui"
                value={summary.sessions_today ?? 0}
                icon={Activity}
                color="orange"
              />
              <StatCard
                label="Patients en traitement"
                value={summary.patients_with_active_plan ?? 0}
                icon={Users}
                color="blue"
              />
              <StatCard
                label="Séances manquées"
                value={summary.missed_sessions_today ?? 0}
                icon={XCircle}
                color="red"
              />
            </>
          )}

          {isSupport && !isAdmin && (
            <>
              <StatCard
                label="Tickets ouverts"
                value={summary.open_tickets_count ?? 0}
                icon={Ticket}
                color="yellow"
              />
              <StatCard
                label="Tickets critiques"
                value={summary.critical_tickets ?? 0}
                icon={AlertTriangle}
                color="red"
              />
              <StatCard
                label="Résolus ce mois"
                value={summary.tickets_resolved_this_month ?? 0}
                icon={CheckCircle2}
                color="green"
              />
              <StatCard
                label="Tickets total"
                value={summary.tickets_count ?? 0}
                icon={FileText}
                color="blue"
              />
            </>
          )}

          {isHR && !isAdmin && (
            <>
              <StatCard
                label="Congés en attente"
                value={summary.pending_leave_requests_count ?? 0}
                icon={CalendarDays}
                color="blue"
              />
              <StatCard
                label="Absences aujourd'hui"
                value={summary.absences_today ?? 0}
                icon={Clock}
                color="orange"
              />
              <StatCard
                label="Employés actifs"
                value={summary.active_employees ?? 0}
                icon={UserPlus}
                color="green"
              />
              <StatCard
                label="En congé aujourd'hui"
                value={summary.employees_on_leave_today ?? 0}
                icon={UserCog}
                color="purple"
              />
            </>
          )}

          {!isAdmin && !isFinance && !isMedical && !isSupport && !isHR && (
            <>
              <StatCard
                label="Patients"
                value={summary.patients_count}
                icon={Users}
                color="blue"
              />
              <StatCard
                label="Tickets"
                value={summary.tickets_count ?? 0}
                icon={Ticket}
                color="yellow"
              />
              <StatCard
                label="Factures"
                value={summary.invoices_count ?? 0}
                icon={FileText}
                color="green"
              />
              <StatCard
                label="Employés"
                value={summary.employees_count}
                icon={Briefcase}
                color="purple"
              />
            </>
          )}
        </div>

        {/* Charts - Role specific */}
        <div className="grid gap-4 lg:grid-cols-2">
          {isFinance && !isAdmin && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>État des paiements</CardTitle>
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
                    <span className="text-xs text-muted-foreground">Payé</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 justify-center text-xs">
                  {billingSplit.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name} ({formatMoney(p.value)})
                    </div>
                  ))}
                  {(summary.cnam_pending_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: "#8b5cf6" }} />
                      CNAM en attente ({summary.cnam_pending_count})
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isSupport && !isAdmin && summary.tickets_by_status && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Tickets par statut</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(summary.tickets_by_status).map(([name, value]) => ({
                        name,
                        value,
                      }))}
                      layout="vertical"
                      margin={{ left: 40 }}
                    >
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="var(--primary)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {isMedical && !isAdmin && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Activité clinique</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.active_treatment_plans_count ?? 0} plan(s) actif(s)
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const clinicalData = [
                    { name: "Planifiées", value: summary.scheduled_sessions_count ?? 0, color: "#3b82f6" },
                    { name: "Complétées", value: summary.completed_sessions_count ?? 0, color: "#22c55e" },
                    { name: "Manquées", value: summary.missed_sessions_today ?? 0, color: "#ef4444" },
                  ].filter((d) => d.value > 0);

                  if (clinicalData.length === 0) {
                    return (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Aucune donnée clinique disponible.
                      </p>
                    );
                  }

                  return (
                    <>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={clinicalData} innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                              {clinicalData.map((e) => (
                                <Cell key={e.name} fill={e.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4 justify-center text-xs">
                        {clinicalData.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                            {p.name} ({p.value})
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {isHR && !isAdmin && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Présence du personnel</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.pending_leave_requests_count ?? 0} congé(s) en attente
                </p>
              </CardHeader>
              <CardContent>
                {(() => {
                  const total = summary.active_employees ?? summary.employees_count ?? 0;
                  const present = Math.max(0, total - (summary.absences_today ?? 0) - (summary.employees_on_leave_today ?? 0));
                  const hrData = [
                    { name: "Présents", value: present, color: "#22c55e" },
                    { name: "Absents", value: summary.absences_today ?? 0, color: "#ef4444" },
                    { name: "En congé", value: summary.employees_on_leave_today ?? 0, color: "#3b82f6" },
                  ].filter((d) => d.value > 0);

                  if (hrData.length === 0) {
                    return (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Aucune donnée RH disponible.
                      </p>
                    );
                  }

                  return (
                    <>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={hrData} innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                              {hrData.map((e) => (
                                <Cell key={e.name} fill={e.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4 justify-center text-xs">
                        {hrData.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                            {p.name} ({p.value})
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {isAdmin && (
            <>
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Revenue par mois</CardTitle>
                </CardHeader>
                <CardContent>
                  {monthlyRevenue.length === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Aucune facture pour le moment.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={monthlyRevenue}>
                        <defs>
                          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          stroke="var(--muted-foreground)"
                          fontSize={12}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                          }}
                          formatter={(value: number) => formatMoney(value)}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          fill="url(#fill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>État des paiements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={billingSplit} innerRadius={60} outerRadius={85} dataKey="value" stroke="none">
                          {billingSplit.map((e) => (
                            <Cell key={e.name} fill={e.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-semibold">{paidPercent}%</span>
                      <span className="text-xs text-muted-foreground">Payé</span>
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
            </>
          )}

          {!isFinance && !isSupport && !isMedical && !isHR && !isAdmin && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Activité clinique</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const clinicalData = [
                    { name: "Planifiées", value: summary.scheduled_sessions_count ?? 0, color: "#3b82f6" },
                    { name: "Complétées", value: summary.completed_sessions_count ?? 0, color: "#22c55e" },
                    { name: "Manquées", value: summary.missed_sessions_today ?? 0, color: "#ef4444" },
                  ].filter((d) => d.value > 0);

                  if (clinicalData.length === 0) {
                    return (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Aucune donnée clinique disponible.
                      </p>
                    );
                  }

                  return (
                    <>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={clinicalData} innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                              {clinicalData.map((e) => (
                                <Cell key={e.name} fill={e.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4 justify-center text-xs">
                        {clinicalData.map((p) => (
                          <div key={p.name} className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                            {p.name} ({p.value})
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Bottom - Recent data (common to all roles) */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Factures récentes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° facture</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Statut</TableHead>
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

                  {recentInvoices.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        Aucune facture récente.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Derniers patients</CardTitle>
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

              {recentPatients.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucun patient récent.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

// ── StatCard component ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: "blue" | "green" | "red" | "yellow" | "orange" | "purple" | "teal" | "pink" | "indigo";
}) {
  const colorMap = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-success/10 text-success",
    red: "bg-destructive/10 text-destructive",
    yellow: "bg-yellow-500/10 text-yellow-600",
    orange: "bg-orange-500/10 text-orange-600",
    purple: "bg-purple-500/10 text-purple-600",
    teal: "bg-teal-500/10 text-teal-600",
    pink: "bg-pink-500/10 text-pink-600",
    indigo: "bg-indigo-500/10 text-indigo-600",
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground truncate">{label}</p>
            <p className="text-2xl font-semibold mt-2 truncate" title={String(value)}>
              {value}
            </p>
          </div>
          <div className={`rounded-lg p-2.5 shrink-0 ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}