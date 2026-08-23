import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portalAppointments, type PortalAppointment } from "@/lib/patient-portal-api";
import { CalendarDays, Clock } from "lucide-react";

export const Route = createFileRoute("/patient-portal/appointments")({
  component: AppointmentsPage,
});

type Filter = "6m" | "1y" | "all";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed:  "bg-emerald-100 text-emerald-700",
  cancelled:  "bg-red-100 text-red-700",
  done:       "bg-gray-100 text-gray-500",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Planifié",
  confirmed:  "Confirmé",
  cancelled:  "Annulé",
  done:       "Effectué",
};

function AppointmentsPage() {
  const [appointments, setAppointments] = useState<PortalAppointment[]>([]);
  const [filter, setFilter]             = useState<Filter>("all");
  const [upcoming, setUpcoming]         = useState(false);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    setLoading(true);
    portalAppointments(filter, upcoming)
      .then(setAppointments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, upcoming]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Mes rendez-vous
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {appointments.length} rendez-vous trouvé{appointments.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setUpcoming(!upcoming)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              upcoming
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {upcoming ? "✓ " : ""}À venir seulement
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(["6m", "1y", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {f === "6m" ? "6 mois" : f === "1y" ? "1 an" : "Tout"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))
        ) : appointments.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun rendez-vous trouvé.</p>
          </div>
        ) : (
          appointments.map((apt) => {
            const d = new Date(apt.date);
            return (
              <div
                key={apt.id}
                className="bg-white rounded-xl border p-4 flex items-center gap-4"
              >
                {/* Date block */}
                <div className="text-center w-14 shrink-0 bg-gray-50 rounded-lg py-2">
                  <p className="text-xs text-gray-400">
                    {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 leading-none">{d.getDate()}</p>
                  <p className="text-xs text-gray-400">
                    {d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
                  </p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {apt.type || "Rendez-vous"}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {apt.duration_minutes ? ` · ${apt.duration_minutes} min` : ""}
                    </span>
                    {apt.doctor_name && <span>Dr. {apt.doctor_name}</span>}
                    {apt.room_name && <span>· {apt.room_name}</span>}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                    STATUS_COLORS[apt.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {STATUS_LABELS[apt.status] ?? apt.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}