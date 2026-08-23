import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  portalMedicalHistory,
  portalAppointments,
  type PortalTreatmentPlan,
  type PortalAppointment,
  type PortalSession,
} from "@/lib/patient-portal-api";
import { Activity, ChevronDown, ChevronUp, Zap } from "lucide-react";
 
// ── Medical History ───────────────────────────────────────────────────────────
 
export const Route = createFileRoute("/patient-portal/medical-history")({
  component: MedicalHistoryPage,
});
 
type Filter = "6m" | "1y" | "all";
 
function MedicalHistoryPage() {
  const [plans, setPlans] = useState<PortalTreatmentPlan[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
 
  useEffect(() => {
    setLoading(true);
    portalMedicalHistory(filter)
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);
 
  function toggle(id: number) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
 
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Historique médical
          </h1>
          <p className="text-sm text-gray-500 mt-1">Vos protocoles de traitement et séances</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["6m", "1y", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "6m" ? "6 mois" : f === "1y" ? "1 an" : "Tout"}
            </button>
          ))}
        </div>
      </div>
 
      {/* Plans */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucun traitement trouvé pour cette période.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isOpen={expanded.has(plan.id)}
              onToggle={() => toggle(plan.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
 
function PlanCard({ plan, isOpen, onToggle }: {
  plan: PortalTreatmentPlan;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const statusColors: Record<string, string> = {
    active:    "bg-emerald-100 text-emerald-700",
    completed: "bg-blue-100 text-blue-700",
    draft:     "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
  };
  const statusLabels: Record<string, string> = {
    active: "En cours", completed: "Terminé", draft: "Brouillon", cancelled: "Annulé",
  };
 
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <Zap className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{plan.diagnosis}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[plan.status] ?? "bg-gray-100 text-gray-600"}`}>
              {statusLabels[plan.status] ?? plan.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span>{plan.total_dose_gy} Gy · {plan.number_of_fractions} fractions</span>
            {plan.start_date && (
              <span>Début : {new Date(plan.start_date).toLocaleDateString("fr-FR")}</span>
            )}
          </div>
          {plan.status === "active" && (
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full w-48">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${plan.progress_pct}%` }}
              />
            </div>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />}
      </button>
 
      {isOpen && (
        <div className="border-t px-5 pb-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-3">
            Séances ({plan.sessions.length})
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {plan.sessions.length === 0 ? (
              <p className="text-xs text-gray-400">Aucune séance enregistrée.</p>
            ) : (
              plan.sessions.map((s) => <SessionRow key={s.id} session={s} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
 
function SessionRow({ session }: { session: PortalSession }) {
  const sc: Record<string, string> = {
    completed:   "bg-emerald-100 text-emerald-700",
    in_progress: "bg-blue-100 text-blue-700",
    scheduled:   "bg-gray-100 text-gray-600",
    cancelled:   "bg-red-100 text-red-700",
  };
  const sl: Record<string, string> = {
    completed: "Effectuée", in_progress: "En cours", scheduled: "Planifiée", cancelled: "Annulée",
  };
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm">
      <span className="text-xs font-mono text-gray-400 w-8">#{session.session_number}</span>
      <span className="text-gray-600 flex-1">
        {new Date(session.scheduled_date).toLocaleDateString("fr-FR", {
          day: "2-digit", month: "short", year: "numeric",
        })}
      </span>
      {session.dose_delivered_gy != null && (
        <span className="text-xs text-gray-400">{session.dose_delivered_gy} Gy</span>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc[session.status] ?? "bg-gray-100 text-gray-600"}`}>
        {sl[session.status] ?? session.status}
      </span>
    </div>
  );
}