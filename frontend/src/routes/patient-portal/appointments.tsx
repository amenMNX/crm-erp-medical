// src/routes/patient-portal/appointments.tsx
// US-PAT-05 — Portail Patient : prise de RDV, consultation des disponibilités médecin,
// annulation de RDV existants.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  portalAppointments,
  portalListDoctors,
  portalGetDoctorSlots,
  portalBookAppointment,
  portalCancelAppointment,
  type PortalAppointment,
  type PortalDoctor,
  type PortalSlot,
  type AppointmentType,
  APPOINTMENT_TYPE_LABELS,
} from "@/lib/patient-portal-api";
import {
  CalendarDays,
  Clock,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Stethoscope,
  CalendarCheck,
  MessageSquare,
  XCircle,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/patient-portal/appointments")({
  component: AppointmentsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

type Filter = "6m" | "1y" | "all";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  confirmed:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled:  "bg-red-100 text-red-600 border-red-200",
  done:       "bg-gray-100 text-gray-500 border-gray-200",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Planifié",
  confirmed:  "Confirmé",
  cancelled:  "Annulé",
  done:       "Effectué",
};

// ─── Wizard step type ─────────────────────────────────────────────────────────

type WizardStep = "type" | "doctor" | "slot" | "confirm" | "done";

interface WizardState {
  step: WizardStep;
  appointmentType: AppointmentType | null;
  doctor: PortalDoctor | null;
  slot: PortalSlot | null;
  reason: string;
}

const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "type",    label: "Type" },
  { key: "doctor",  label: "Médecin" },
  { key: "slot",    label: "Créneau" },
  { key: "confirm", label: "Confirmation" },
];

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ─── Main page ────────────────────────────────────────────────────────────────

function AppointmentsPage() {
  const [appointments, setAppointments] = useState<PortalAppointment[]>([]);
  const [filter, setFilter]             = useState<Filter>("all");
  const [upcoming, setUpcoming]         = useState(false);
  const [loading, setLoading]           = useState(true);
  const [showWizard, setShowWizard]     = useState(false);

  const [cancelTarget, setCancelTarget]   = useState<PortalAppointment | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError]     = useState("");

  function reload() {
    setLoading(true);
    portalAppointments(filter, upcoming)
      .then(setAppointments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, [filter, upcoming]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancel(apt: PortalAppointment) {
    setCancelLoading(true);
    setCancelError("");
    try {
      await portalCancelAppointment(apt.id);
      setCancelTarget(null);
      reload();
    } catch (e: any) {
      setCancelError(e?.data?.detail ?? e?.message ?? "Erreur lors de l'annulation.");
    } finally {
      setCancelLoading(false);
    }
  }

  function onBookingDone() {
    setShowWizard(false);
    reload();
  }

  const canCancel = (apt: PortalAppointment) =>
    apt.status === "scheduled" || apt.status === "confirmed";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {showWizard && (
        <BookingWizard
          onClose={() => setShowWizard(false)}
          onDone={onBookingDone}
        />
      )}

      {/* Cancel confirm dialog */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="font-semibold text-gray-900">Annuler ce rendez-vous ?</h3>
            </div>
            <p className="text-sm text-gray-600">
              Vous êtes sur le point d'annuler votre rendez-vous du{" "}
              <strong>
                {new Date(cancelTarget.date).toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </strong>{" "}
              à{" "}
              <strong>
                {new Date(cancelTarget.date).toLocaleTimeString("fr-FR", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </strong>
              {cancelTarget.doctor_name ? ` avec Dr. ${cancelTarget.doctor_name}` : ""}.
            </p>
            {cancelError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {cancelError}
              </p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setCancelTarget(null); setCancelError(""); }}
                className="flex-1 px-4 py-2 rounded-xl border text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Conserver
              </button>
              <button
                onClick={() => handleCancel(cancelTarget)}
                disabled={cancelLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {cancelLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Annuler le RDV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Mes rendez-vous
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? "Chargement…" : `${appointments.length} rendez-vous trouvé${appointments.length > 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
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
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Prendre un RDV
          </button>
        </div>
      </div>

      {/* Appointment list */}
      <div className="space-y-2">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))
        ) : appointments.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 mb-4">Aucun rendez-vous trouvé.</p>
            <button
              onClick={() => setShowWizard(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Prendre un rendez-vous
            </button>
          </div>
        ) : (
          appointments.map((apt) => {
            const d = new Date(apt.date);
            const cancellable = canCancel(apt);
            return (
              <div
                key={apt.id}
                className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="text-center w-14 shrink-0 bg-gray-50 rounded-xl py-2.5 border">
                  <p className="text-[10px] uppercase text-gray-400 font-medium">
                    {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 leading-none mt-0.5">
                    {d.getDate()}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}
                  </p>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    {apt.type || "Rendez-vous"}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {apt.duration_minutes ? ` · ${apt.duration_minutes} min` : ""}
                    </span>
                    {apt.doctor_name && (
                      <span className="flex items-center gap-1">
                        <Stethoscope className="h-3 w-3" />
                        Dr. {apt.doctor_name}
                      </span>
                    )}
                    {apt.room_name && (
                      <span className="text-gray-400">· {apt.room_name}</span>
                    )}
                  </div>
                  {apt.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{apt.notes}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                      STATUS_COLORS[apt.status] ?? "bg-gray-100 text-gray-600 border-gray-200"
                    }`}
                  >
                    {STATUS_LABELS[apt.status] ?? apt.status}
                  </span>
                  {cancellable && (
                    <button
                      onClick={() => { setCancelTarget(apt); setCancelError(""); }}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 transition-colors"
                    >
                      <XCircle className="h-3 w-3" />
                      Annuler
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({
  availableDates,
  selectedDate,
  onSelectDate,
}: {
  availableDates: Set<string>; // YYYY-MM-DD
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Build grid: days of the month, padded to start on Monday
  const firstDay = new Date(viewYear, viewMonth, 1);
  // 0=Sun…6=Sat → convert to Mon-first: Mon=0…Sun=6
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS_FR[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_FR.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`pad-${idx}`} />;

          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasSlots  = availableDates.has(dateStr);
          const isSelected = dateStr === selectedDate;
          const isPast = new Date(dateStr) < new Date(today.toDateString());

          return (
            <button
              key={dateStr}
              onClick={() => hasSlots && !isPast && onSelectDate(dateStr)}
              disabled={!hasSlots || isPast}
              className={`
                relative mx-auto h-8 w-8 rounded-full text-xs font-medium transition-all flex items-center justify-center
                ${isSelected
                  ? "bg-primary text-primary-foreground shadow-md"
                  : hasSlots && !isPast
                  ? "text-gray-800 hover:bg-primary/10 hover:text-primary cursor-pointer"
                  : "text-gray-300 cursor-default"
                }
              `}
            >
              {day}
              {/* Dot indicator for available dates */}
              {hasSlots && !isPast && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Booking Wizard ───────────────────────────────────────────────────────────

function BookingWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [wizard, setWizard] = useState<WizardState>({
    step: "type",
    appointmentType: null,
    doctor: null,
    slot: null,
    reason: "",
  });

  const [doctors, setDoctors]                   = useState<PortalDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading]     = useState(false);

  const [slots, setSlots]                       = useState<PortalSlot[]>([]);
  const [slotsLoading, setSlotsLoading]         = useState(false);
  const [slotsError, setSlotsError]             = useState("");

  // Calendar state — which date is currently selected
  const [selectedDate, setSelectedDate]         = useState<string | null>(null);

  const [booking, setBooking]                   = useState(false);
  const [bookError, setBookError]               = useState("");
  const [bookResult, setBookResult]             = useState<{ date: string; doctor: string; time: string } | null>(null);

  // Load doctors when entering step 2
  useEffect(() => {
    if (wizard.step !== "doctor") return;
    setDoctorsLoading(true);
    portalListDoctors()
      .then(setDoctors)
      .catch(() => {})
      .finally(() => setDoctorsLoading(false));
  }, [wizard.step]);

  // Load slots when entering step 3
  useEffect(() => {
    if (wizard.step !== "slot" || !wizard.doctor || !wizard.appointmentType) return;
    setSlotsLoading(true);
    setSlotsError("");
    setSelectedDate(null);
    portalGetDoctorSlots(wizard.doctor.id, wizard.appointmentType)
      .then((res) => {
        setSlots(res.slots);
        // Auto-select the first available date
        if (res.slots.length > 0) {
          const firstDate = res.slots
            .map((s) => s.date)
            .sort()[0];
          setSelectedDate(firstDate);
        }
      })
      .catch((e) => setSlotsError(e?.data?.detail ?? "Impossible de charger les créneaux."))
      .finally(() => setSlotsLoading(false));
  }, [wizard.step, wizard.doctor, wizard.appointmentType]);

  // Derived data
  const availableDates = useMemo(() => new Set(slots.map((s) => s.date)), [slots]);

  const slotsForSelectedDate = useMemo(
    () => slots.filter((s) => s.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time)),
    [slots, selectedDate]
  );

  async function handleBook() {
    if (!wizard.doctor || !wizard.slot || !wizard.appointmentType) return;
    setBooking(true);
    setBookError("");
    try {
      const res = await portalBookAppointment({
        doctor_id: wizard.doctor.id,
        slot_datetime: wizard.slot.datetime,   // string, pas un objet Date
        appointment_type: wizard.appointmentType,
        reason: wizard.reason,
        duration_minutes: wizard.appointmentType === "operation" ? wizard.operationDuration : undefined,
      });
      const d = new Date(res.appointment_date);
      setBookResult({
        date: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        doctor: wizard.doctor.full_name,
      });
      setWizard((w) => ({ ...w, step: "done" }));
    } catch (e: any) {
      setBookError(e?.data?.detail ?? e?.message ?? "Erreur lors de la réservation.");
    } finally {
      setBooking(false);
    }
  }

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === wizard.step);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            Prendre un rendez-vous
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress bar */}
        {wizard.step !== "done" && (
          <div className="px-5 pt-4">
            <div className="flex items-center gap-0">
              {WIZARD_STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center flex-1">
                  <div
                    className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold border-2 shrink-0 transition-colors ${
                      i < stepIndex
                        ? "bg-primary border-primary text-primary-foreground"
                        : i === stepIndex
                        ? "border-primary text-primary bg-primary/10"
                        : "border-gray-200 text-gray-400 bg-white"
                    }`}
                  >
                    {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  {i < WIZARD_STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 transition-colors ${
                        i < stepIndex ? "bg-primary" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1 px-0.5">
              {WIZARD_STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className={`text-[10px] font-medium ${
                    i === stepIndex ? "text-primary" : "text-gray-400"
                  }`}
                  style={{ width: `${100 / WIZARD_STEPS.length}%`, textAlign: i === 0 ? "left" : i === WIZARD_STEPS.length - 1 ? "right" : "center" }}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="p-5 flex-1">

          {/* ── STEP 1: Type de RDV ───────────────────────────── */}
          {wizard.step === "type" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Quel type de consultation souhaitez-vous ?
              </p>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() =>
                      setWizard((w) => ({
                        ...w,
                        appointmentType: type,
                        step: "doctor",
                      }))
                    }
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:border-primary hover:bg-primary/5 ${
                      wizard.appointmentType === type
                        ? "border-primary bg-primary/5"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {type === "simple"   && <User className="h-4 w-4 text-primary" />}
                      {type === "complex"  && <Stethoscope className="h-4 w-4 text-primary" />}
                      {type === "followup" && <CalendarDays className="h-4 w-4 text-primary" />}
                      {type === "urgency"  && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {APPOINTMENT_TYPE_LABELS[type].split(" (")[0]}
                      </p>
                      <p className="text-xs text-gray-500">
                        {APPOINTMENT_TYPE_LABELS[type].match(/\((.+)\)/)?.[1] ?? ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Duration picker for operation type */}
              {wizard.appointmentType === "operation" && (
                <div className="mt-2 flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-rose-800">
                    <Timer className="h-4 w-4" />
                    Durée de l'opération
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={wizard.operationDuration}
                      onChange={(e) => {
                        const v = Math.max(15, Math.min(480, parseInt(e.target.value, 10) || 60));
                        setWizard((w) => ({ ...w, operationDuration: v }));
                      }}
                      className="w-24 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                    />
                    <span className="text-sm font-medium text-rose-700">
                      {wizard.operationDuration >= 60
                        ? `${Math.floor(wizard.operationDuration / 60)}h${
                            wizard.operationDuration % 60 > 0
                              ? String(wizard.operationDuration % 60).padStart(2, "0")
                              : ""
                          }`
                        : `${wizard.operationDuration} min`}
                    </span>
                  </div>
                  <p className="text-xs text-rose-600">
                    Entre 15 min et 8h — multiples de 15 min recommandés.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Choix du médecin ──────────────────────── */}
          {wizard.step === "doctor" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Choisissez votre médecin :
              </p>
              {doctorsLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Chargement des médecins…</span>
                </div>
              ) : doctors.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun médecin disponible pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {doctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() =>
                        setWizard((w) => ({ ...w, doctor: doc, step: "slot" }))
                      }
                      disabled={!doc.has_availability}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        !doc.has_availability
                          ? "opacity-50 cursor-not-allowed border-gray-100 bg-gray-50"
                          : wizard.doctor?.id === doc.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 hover:border-primary hover:bg-primary/5"
                      }`}
                    >
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                        {doc.first_name[0]}{doc.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{doc.full_name}</p>
                        {doc.specialty && (
                          <p className="text-xs text-gray-500 truncate">{doc.specialty}</p>
                        )}
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          doc.has_availability
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {doc.has_availability ? "Disponible" : "Complet"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Calendrier + créneaux ────────────────── */}
          {wizard.step === "slot" && (
            <div className="space-y-4">
              {slotsLoading ? (
                <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Recherche des créneaux…</span>
                </div>
              ) : slotsError ? (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {slotsError}
                </div>
              ) : slots.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun créneau disponible dans les 14 prochains jours.</p>
                </div>
              ) : (
                <>
                  {/* Calendar */}
                  <div className="rounded-xl border p-4 bg-gray-50">
                    <MiniCalendar
                      availableDates={availableDates}
                      selectedDate={selectedDate}
                      onSelectDate={(d) => {
                        setSelectedDate(d);
                        // Clear any previously selected slot when changing date
                        setWizard((w) => ({ ...w, slot: null }));
                      }}
                    />
                  </div>

                  {/* Time slots for selected date */}
                  {selectedDate && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Horaires disponibles — {new Date(selectedDate + "T00:00:00").toLocaleDateString("fr-FR", {
                          weekday: "long", day: "numeric", month: "long",
                        })}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {slotsForSelectedDate.map((slot) => {
                          const isSelected = wizard.slot?.datetime === slot.datetime;
                          return (
                            <button
                              key={slot.datetime}
                              onClick={() => setWizard((w) => ({ ...w, slot, step: "confirm" }))}
                              className={`flex flex-col items-center px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                  : "bg-white text-gray-700 border-gray-200 hover:border-primary hover:text-primary hover:bg-primary/5"
                              }`}
                            >
                              <span className="flex items-center gap-1.5 font-semibold">
                                <Clock className="h-3.5 w-3.5" />
                                {slot.time}
                              </span>
                              <span className="text-[10px] mt-0.5 opacity-70">
                                {slot.duration_minutes} min
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 4: Confirmation ──────────────────────────── */}
          {wizard.step === "confirm" && wizard.slot && wizard.doctor && wizard.appointmentType && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Vérifiez les détails de votre rendez-vous :</p>

              <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                <SummaryRow
                  icon={<CalendarDays className="h-4 w-4 text-primary" />}
                  label="Date"
                  value={new Date(wizard.slot.datetime).toLocaleDateString("fr-FR", {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                  })}
                />
                <SummaryRow
                  icon={<Clock className="h-4 w-4 text-primary" />}
                  label="Heure"
                  value={`${wizard.slot.time} · ${
                    wizard.appointmentType === "operation"
                      ? wizard.operationDuration >= 60
                        ? `${Math.floor(wizard.operationDuration / 60)}h${
                            wizard.operationDuration % 60 > 0
                              ? String(wizard.operationDuration % 60).padStart(2, "0")
                              : ""
                          }`
                        : `${wizard.operationDuration} min`
                      : `${wizard.slot.duration_minutes} min`
                  }`}
                />
                <SummaryRow
                  icon={<User className="h-4 w-4 text-primary" />}
                  label="Médecin"
                  value={wizard.doctor.full_name}
                />
                <SummaryRow
                  icon={<Stethoscope className="h-4 w-4 text-primary" />}
                  label="Type"
                  value={APPOINTMENT_TYPE_LABELS[wizard.appointmentType].split(" (")[0]}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
                  Motif (optionnel)
                </label>
                <textarea
                  value={wizard.reason}
                  onChange={(e) => setWizard((w) => ({ ...w, reason: e.target.value }))}
                  placeholder="Décrivez brièvement le motif de votre consultation…"
                  rows={3}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              {bookError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {bookError}
                </div>
              )}

              <p className="text-xs text-gray-500">
                Votre demande sera transmise à l'équipe médicale. Vous recevrez une
                confirmation sous 48h.
              </p>
            </div>
          )}

          {/* ── STEP DONE ─────────────────────────────────────── */}
          {wizard.step === "done" && bookResult && (
            <div className="text-center py-4 space-y-4">
              <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Demande envoyée !</h3>
                <p className="text-sm text-gray-500 mt-1">Votre rendez-vous a bien été soumis.</p>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 text-left space-y-2">
                <p className="text-sm">
                  <span className="text-gray-500">Date : </span>
                  <strong className="text-gray-800">{bookResult.date}</strong>
                </p>
                <p className="text-sm">
                  <span className="text-gray-500">Heure : </span>
                  <strong className="text-gray-800">{bookResult.time}</strong>
                </p>
                <p className="text-sm">
                  <span className="text-gray-500">Médecin : </span>
                  <strong className="text-gray-800">{bookResult.doctor}</strong>
                </p>
              </div>
              <p className="text-xs text-gray-500">
                Vous recevrez une confirmation sous 48h. Le rendez-vous apparaît
                dans votre liste avec le statut <em>Planifié</em>.
              </p>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {wizard.step !== "done" && (
          <div className="flex items-center justify-between p-5 border-t bg-gray-50 rounded-b-2xl">
            <button
              onClick={() => {
                if (wizard.step === "type")    { onClose(); return; }
                if (wizard.step === "doctor")  setWizard((w) => ({ ...w, step: "type" }));
                if (wizard.step === "slot")    setWizard((w) => ({ ...w, step: "doctor", slot: null }));
                if (wizard.step === "confirm") setWizard((w) => ({ ...w, step: "slot" }));
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              {wizard.step === "type" ? "Annuler" : "Retour"}
            </button>

            {wizard.step === "confirm" && (
              <button
                onClick={handleBook}
                disabled={booking}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
              >
                {booking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarCheck className="h-4 w-4" />
                )}
                Confirmer le rendez-vous
              </button>
            )}

            {wizard.step !== "confirm" && (
              <span className="text-xs text-gray-400">
                Étape {stepIndex + 1} / {WIZARD_STEPS.length}
              </span>
            )}
          </div>
        )}

        {wizard.step === "done" && (
          <div className="p-5 border-t bg-gray-50 rounded-b-2xl flex justify-center">
            <button
              onClick={onDone}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
              Voir mes rendez-vous
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-800 capitalize">{value}</p>
      </div>
    </div>
  );
}