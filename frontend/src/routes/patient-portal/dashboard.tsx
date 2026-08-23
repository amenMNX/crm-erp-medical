import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portalDashboard, type PortalDashboard } from "@/lib/patient-portal-api";
import {
  CalendarDays,
  MessageSquare,
  FileText,
  Activity,
  ChevronRight,
  Clock,
  AlertCircle,
} from "lucide-react";
 
export const Route = createFileRoute("/patient-portal/dashboard")({
  component: PatientDashboard,
});
 
function PatientDashboard() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
 
  useEffect(() => {
    portalDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
 
  if (loading) return <PageSkeleton />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;
 
  const { patient, upcoming_appointments, active_treatment, unread_messages, unpaid_invoices_count, unpaid_invoices_total } = data;
 
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {patient.first_name} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          MRN : {patient.medical_record_number} · Voici votre espace personnel
        </p>
      </div>
 
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<CalendarDays className="h-5 w-5 text-blue-600" />}
          bg="bg-blue-50"
          label="Prochains RDV"
          value={String(upcoming_appointments.length)}
          href="/patient-portal/appointments"
        />
        <KpiCard
          icon={<Activity className="h-5 w-5 text-emerald-600" />}
          bg="bg-emerald-50"
          label="Traitement actif"
          value={active_treatment ? `${active_treatment.progress_pct}%` : "—"}
          sub={active_treatment?.diagnosis ?? "Aucun en cours"}
          href="/patient-portal/medical-history"
        />
        <KpiCard
          icon={<MessageSquare className="h-5 w-5 text-violet-600" />}
          bg="bg-violet-50"
          label="Messages non lus"
          value={String(unread_messages)}
          alert={unread_messages > 0}
          href="/patient-portal/messages"
        />
        <KpiCard
          icon={<FileText className="h-5 w-5 text-amber-600" />}
          bg="bg-amber-50"
          label="Factures impayées"
          value={unpaid_invoices_count > 0 ? `${unpaid_invoices_total} TND` : "À jour"}
          alert={unpaid_invoices_count > 0}
          href="/patient-portal/documents"
        />
      </div>
 
      {/* Active Treatment Progress */}
      {active_treatment && (
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Traitement en cours</h2>
            <Link to="/patient-portal/medical-history" className="text-xs text-primary hover:underline flex items-center gap-1">
              Voir détails <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{active_treatment.diagnosis}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {active_treatment.total_dose_gy} Gy · {active_treatment.number_of_fractions} fractions
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Progression</span>
                  <span className="font-medium text-gray-700">{active_treatment.progress_pct}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${active_treatment.progress_pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{active_treatment.sessions.filter(s => s.status === "completed").length} séances effectuées</span>
                  <span>{active_treatment.number_of_fractions - active_treatment.sessions.filter(s => s.status === "completed").length} restantes</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
 
      {/* Upcoming Appointments */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Prochains rendez-vous</h2>
          <Link to="/patient-portal/appointments" className="text-xs text-primary hover:underline flex items-center gap-1">
            Tous les RDV <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {upcoming_appointments.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucun rendez-vous à venir.</p>
        ) : (
          <div className="space-y-2">
            {upcoming_appointments.slice(0, 4).map((apt) => (
              <AppointmentRow key={apt.id} apt={apt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
 
// ─── Sub-components ───────────────────────────────────────────────────────────
 
function KpiCard({
  icon, bg, label, value, sub, href, alert,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: string;
  sub?: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      to={href}
      className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow flex flex-col gap-3 relative"
    >
      {alert && (
        <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
      )}
      <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 truncate mt-0.5">{sub}</p>}
      </div>
    </Link>
  );
}
 
function AppointmentRow({ apt }: { apt: { date: string; type: string; doctor_name: string | null; status: string } }) {
  const date = new Date(apt.date);
  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    confirmed:  "bg-emerald-100 text-emerald-700",
    cancelled:  "bg-red-100 text-red-700",
    done:       "bg-gray-100 text-gray-500",
  };
  const statusLabels: Record<string, string> = {
    scheduled: "Planifié",
    confirmed:  "Confirmé",
    cancelled:  "Annulé",
    done:       "Effectué",
  };
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
      <div className="text-center min-w-12">
        <p className="text-xs text-gray-400">{date.toLocaleDateString("fr-FR", { weekday: "short" })}</p>
        <p className="text-lg font-bold text-gray-800 leading-none">{date.getDate()}</p>
        <p className="text-xs text-gray-400">{date.toLocaleDateString("fr-FR", { month: "short" })}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{apt.type || "Rendez-vous"}</p>
        {apt.doctor_name && (
          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            {date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            &nbsp;·&nbsp;Dr. {apt.doctor_name}
          </p>
        )}
      </div>
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[apt.status] ?? "bg-gray-100 text-gray-600"}`}>
        {statusLabels[apt.status] ?? apt.status}
      </span>
    </div>
  );
}
 
function PageSkeleton() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/3" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-40 bg-gray-200 rounded-xl" />
      <div className="h-56 bg-gray-200 rounded-xl" />
    </div>
  );
}
 
function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 max-w-lg mx-auto mt-8">
      <AlertCircle className="h-5 w-5 shrink-0" />
      <p className="text-sm">{message}</p>
    </div>
  );
}