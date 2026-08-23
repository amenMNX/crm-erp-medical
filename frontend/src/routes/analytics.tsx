import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  HeartPulse,
  UserCog,
  ShieldAlert,
  Building2,
} from "lucide-react";
import {
  fetchKpiDashboard,
  type ApiKpi,
  type ApiKpiDimension,
  type KpiFmt,
} from "@/lib/dashboard-api";
import { fetchInvoices } from "@/lib/invoices-api";
import { fetchTickets } from "@/lib/tickets-api";
import { useMemo } from "react";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & KPI" },
      { name: "description", content: "Tableau de bord KPI avec seuils rouge/orange/vert." },
    ],
  }),
  component: AnalyticsPage,
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(v: number) {
  return v.toLocaleString("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TND";
}

function fmtValue(value: number, fmt: KpiFmt, unit: string): string {
  if (fmt === "currency") return fmtMoney(value);
  if (fmt === "%") return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  if (fmt === "count") return value.toLocaleString("fr-FR");
  if (unit === "j") return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j`;
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

// ─── Dimension icons ──────────────────────────────────────────────────────────

const DIMENSION_ICON: Record<string, React.ElementType> = {
  clinical:   HeartPulse,
  finance:    DollarSign,
  hr:         UserCog,
  quality:    ShieldAlert,
  accounting: Building2,
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function TrendIcon({ status }: { status: ApiKpi["status"] }) {
  if (status === "green")  return <TrendingUp  className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "orange") return <Minus        className="h-3.5 w-3.5 text-amber-500"   />;
  return                          <TrendingDown className="h-3.5 w-3.5 text-red-500"     />;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: ApiKpi }) {
  const borderColor =
    kpi.status === "green"  ? "border-l-emerald-500" :
    kpi.status === "orange" ? "border-l-amber-500"   : "border-l-red-500";

  return (
    <div className={`rounded-lg border border-l-4 ${borderColor} bg-card p-4 shadow-sm space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground leading-snug">{kpi.label}</p>
        <TrendIcon status={kpi.status} />
      </div>
      <p className="text-xl font-bold tabular-nums leading-none">
        {fmtValue(kpi.value, kpi.fmt, kpi.unit)}
      </p>
      {kpi.description && (
        <p className="text-[11px] text-muted-foreground leading-snug">{kpi.description}</p>
      )}
      {(kpi.target_green !== null || kpi.target_orange !== null) && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mt-1">
          {kpi.target_green !== null && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              Cible {fmtValue(kpi.target_green, kpi.fmt, kpi.unit)}
            </span>
          )}
          {kpi.target_orange !== null && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              Seuil {fmtValue(kpi.target_orange, kpi.fmt, kpi.unit)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dimension Panel ──────────────────────────────────────────────────────────

function DimensionPanel({ dim }: { dim: ApiKpiDimension }) {
  const Icon = DIMENSION_ICON[dim.id] ?? Activity;
  const greenCount  = dim.kpis.filter((k) => k.status === "green").length;
  const orangeCount = dim.kpis.filter((k) => k.status === "orange").length;
  const redCount    = dim.kpis.filter((k) => k.status === "red").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-semibold">{dim.label}</h2>
        </div>
        <div className="flex gap-1.5">
          {greenCount  > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{greenCount}</span>}
          {orangeCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{orangeCount}</span>}
          {redCount    > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{redCount}</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {dim.kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function GlobalSummary({ dimensions }: { dimensions: ApiKpiDimension[] }) {
  const all    = dimensions.flatMap((d) => d.kpis);
  const total  = all.length;
  const greens  = all.filter((k) => k.status === "green").length;
  const oranges = all.filter((k) => k.status === "orange").length;
  const reds    = all.filter((k) => k.status === "red").length;
  const score   = total > 0 ? Math.round((greens / total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Score global</p>
            <p className="text-3xl font-bold">{score} %</p>
            <p className="text-[11px] text-muted-foreground">{greens}/{total} KPI dans le vert</p>
          </div>
          <div className="flex gap-4 flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{greens}</p>
              <p className="text-xs text-muted-foreground">Objectif atteint</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{oranges}</p>
              <p className="text-xs text-muted-foreground">À surveiller</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{reds}</p>
              <p className="text-xs text-muted-foreground">Hors seuil</p>
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(greens / total) * 100}%` }} />
              <div className="bg-amber-500 h-full transition-all" style={{ width: `${(oranges / total) * 100}%` }} />
              <div className="bg-red-500 h-full transition-all" style={{ width: `${(reds / total) * 100}%` }} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Trend charts ─────────────────────────────────────────────────────────────

function TrendCharts() {
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const ticketsQuery  = useQuery({ queryKey: ["tickets"],  queryFn: () => fetchTickets() });

  const invoices = invoicesQuery.data ?? [];
  const tickets  = ticketsQuery.data  ?? [];

  // Revenue vs Encaissements par mois
  const revenueByMonth = useMemo(() => {
    const buckets = new Map<string, { revenue: number; paid: number }>();
    for (const inv of invoices) {
      const month = inv.issue_date.slice(0, 7);
      const entry = buckets.get(month) ?? { revenue: 0, paid: 0 };
      entry.revenue += Number(inv.total_amount);
      if (inv.status === "paid") entry.paid += Number(inv.total_amount);
      buckets.set(month, entry);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-9)
      .map(([month, v]) => ({ m: month, facturé: +v.revenue.toFixed(2), encaissé: +v.paid.toFixed(2) }));
  }, [invoices]);

  // Taux de recouvrement par mois (encaissé / facturé)
  const recoveryRate = useMemo(() => {
    return revenueByMonth.map((row) => ({
      m: row.m,
      "taux %": row.facturé > 0 ? Math.round((row.encaissé / row.facturé) * 100) : 0,
    }));
  }, [revenueByMonth]);

  // Tickets par statut
  const ticketsByStatus = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const t of tickets) buckets.set(t.statut, (buckets.get(t.statut) ?? 0) + 1);
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  }, [tickets]);

  // Répartition factures par statut
  const invoicesByStatus = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const inv of invoices) {
      buckets[inv.status] = (buckets[inv.status] ?? 0) + 1;
    }
    const labels: Record<string, string> = { draft: "Brouillon", issued: "Émise", paid: "Payée", cancelled: "Annulée" };
    return Object.entries(buckets).map(([k, v]) => ({ name: labels[k] ?? k, value: v }));
  }, [invoices]);

  const isLoading = invoicesQuery.isLoading || ticketsQuery.isLoading;
  if (isLoading) return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Chargement des tendances…
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Row 1: Revenue chart */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Facturé vs Encaissé par mois</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            {revenueByMonth.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Aucune facture — le graphique se remplira au fur et à mesure.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByMonth}>
                  <defs>
                    <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="m" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Legend />
                  <Area type="monotone" dataKey="facturé"  stroke="var(--primary)"   fill="url(#gf)" />
                  <Area type="monotone" dataKey="encaissé" stroke="var(--chart-2)"   fill="var(--chart-2)" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Row 2: Recovery rate + invoices by status */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-sm">Taux de recouvrement mensuel (%)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-52">
              {recoveryRate.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pas de données.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={recoveryRate}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="m" className="text-xs" />
                    <YAxis className="text-xs" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v} %`} />
                    <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Cible 85%", position: "insideTopRight", fontSize: 10, fill: "#ef4444" }} />
                    <Line type="monotone" dataKey="taux %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Factures par statut</CardTitle></CardHeader>
          <CardContent>
            <div className="h-52">
              {invoicesByStatus.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucune facture.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={invoicesByStatus} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" className="text-xs" width={70} />
                    <Tooltip />
                    <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Tickets by status */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Tickets par statut</CardTitle></CardHeader>
        <CardContent>
          <div className="h-52">
            {ticketsByStatus.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucun ticket.</div>
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "all",        label: "Vue d'ensemble" },
  { id: "clinical",   label: "Clinique" },
  { id: "finance",    label: "Finance" },
  { id: "hr",         label: "RH" },
  { id: "quality",    label: "Qualité" },
  { id: "accounting", label: "Comptabilité" },
  { id: "trends",     label: "Tendances" },
] as const;

type TabId = typeof TABS[number]["id"];

function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>("all");

  const kpiQuery = useQuery({
    queryKey: ["kpi-dashboard"],
    queryFn: fetchKpiDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  const dimensions = kpiQuery.data?.dimensions ?? [];
  const visibleDims = tab === "all" || tab === "trends"
    ? dimensions
    : dimensions.filter((d) => d.id === tab);

  return (
    <AppShell title="Analytics & KPI">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b pb-0 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium rounded-t-md border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 pb-1">
          {kpiQuery.data && (
            <span className="text-[11px] text-muted-foreground">
              Mis à jour : {new Date(kpiQuery.data.generated_at).toLocaleTimeString("fr-FR")}
            </span>
          )}
          <button
            onClick={() => kpiQuery.refetch()}
            disabled={kpiQuery.isFetching}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="Rafraîchir"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${kpiQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {kpiQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des KPI…
        </div>
      )}

      {/* Error */}
      {!kpiQuery.isLoading && kpiQuery.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Impossible de charger les KPI. Vérifiez la connexion au serveur.
        </div>
      )}

      {/* Content */}
      {!kpiQuery.isLoading && kpiQuery.data && (
        <div className="space-y-8">
          {tab === "all" && <GlobalSummary dimensions={dimensions} />}

          {tab !== "trends" && visibleDims.map((dim) => (
            <DimensionPanel key={dim.id} dim={dim} />
          ))}

          {tab === "trends" && <TrendCharts />}

          {tab !== "trends" && (
            <div className="flex flex-wrap gap-4 pt-2 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Objectif atteint (vert)</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />À surveiller (orange)</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Hors seuil (rouge)</span>
              <span className="ml-auto">Rafraîchissement automatique toutes les 5 min</span>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}