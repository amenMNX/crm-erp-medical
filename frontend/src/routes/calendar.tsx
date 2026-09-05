// src/routes/calendar.tsx
// Calendrier des rendez-vous — v2
//
// Nouveautés vs v1 :
//  • Filtre "Mes RDV" : médecin → filtre sur extension__doctor=me ; autres rôles → tous
//  • Chips de statut pour filtrer (Planifié / Confirmé / Annulé / Effectué / Tous)
//  • Données enrichies : doctor_name, appointment_type, duration_minutes, room_name
//  • Tooltip / popover sur chaque RDV dans la vue mois (titre + heure + médecin + durée)
//  • Vue jour avec colonnes horaires positionnées au pixel
//  • Labels en français partout
//  • Skeleton pendant le chargement
//
// ADDED (missing functionality):
//  • Edit appointment dialog (title, date, time, notes)
//  • Delete appointment with confirmation
//  • Quick status update (Planifié → Confirmé → Effectué / Annulé) from event detail panel
//  • SmartAppointmentDialog (AI-assisted booking) next to "Nouveau RDV"
//  • Event detail side-panel: clicking any event opens it with all info + actions
//  • Doctors query (fetchUsers) so the create dialog can assign a doctor
//  • onEventClick wired into MonthView and DayView

import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, ChevronLeft, ChevronRight, Loader2,
  CalendarDays, Clock, User, Stethoscope,
  Pencil, Trash2, X, Sparkles, CheckCircle2,
  XCircle, Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchAllAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  type ApiAppointment,
  type AppointmentStatus,
} from "@/lib/appointments-api";
import { fetchAllPatients } from "@/lib/patients-api";
import { fetchCurrentUser } from "@/lib/me-api";
import { fetchUsers } from "@/lib/users-api";
import { SmartAppointmentDialog } from "@/components/smart-appointment-dialog";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendrier — Radiothérapie" },
      { name: "description", content: "Calendrier des rendez-vous et séances." },
    ],
  }),
  component: CalendarPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "day" | "month" | "year";
type StatusFilter = "all" | "scheduled" | "confirmed" | "cancelled" | "done" | "no_show";

interface CalEvent {
  id: number;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  datetime: Date;
  title: string;
  status: string;
  patientName: string;
  doctorName: string | null;
  doctorId: number | null;
  appointmentType: string;
  durationMinutes: number;
  roomName: string | null;
  // raw fields needed for the edit form
  patientId: number;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const JOURS_SEMAINE = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

const STATUS_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  scheduled: { bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500",    label: "Planifié" },
  confirmed: { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500", label: "Confirmé" },
  cancelled: { bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-500",     label: "Annulé" },
  done:      { bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-400",    label: "Effectué" },
  no_show:   { bg: "bg-orange-50",   text: "text-orange-700",  dot: "bg-orange-400",  label: "Absent" },
};

const TYPE_LABELS: Record<string, string> = {
  simple:   "Consultation",
  complex:  "Complexe",
  followup: "Suivi",
  urgency:  "Urgence",
};

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all",       label: "Tous" },
  { key: "scheduled", label: "Planifié" },
  { key: "confirmed", label: "Confirmé" },
  { key: "done",      label: "Effectué" },
  { key: "cancelled", label: "Annulé" },
  { key: "no_show",   label: "Absent" },
];

// Quick-status transitions shown in the detail panel
const STATUS_TRANSITIONS: { status: AppointmentStatus; label: string; icon: React.ReactNode }[] = [
  { status: "scheduled", label: "Marquer Planifié",  icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { status: "confirmed", label: "Confirmer",          icon: <CheckCircle2  className="h-3.5 w-3.5" /> },
  { status: "done",      label: "Marquer Effectué",  icon: <Check         className="h-3.5 w-3.5" /> },
  { status: "cancelled", label: "Annuler",            icon: <XCircle       className="h-3.5 w-3.5" /> },
];

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Format a local Date as YYYY-MM-DD using LOCAL calendar fields. */
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parse an ISO datetime from the API and extract the date/time strings.
 *
 * The API stores appointment_date as an ISO string that may be UTC
 * (e.g. "2026-09-01T08:00:00Z") or offset-aware ("2026-09-01T09:00:00+01:00").
 * new Date() always converts to local time, so we use local getters for both
 * date and time — this makes the date string match what the calendar cells
 * produce (which also use local Date constructors).
 *
 * The only edge case this won't fix is a pure date string "2026-09-01" without
 * a time part: the spec says that is treated as UTC midnight, which could land
 * on the wrong local day.  To guard against that we append "T00:00" so it is
 * treated as local midnight instead.
 */
function parseAppointmentDate(raw: string): { dt: Date; date: string; time: string } {
  // Django serialises DateTimeField as "2026-09-01T09:00:00Z" (with USE_TZ=True)
  // or "2026-09-01 09:00:00" (space-separated, no timezone, USE_TZ=False / naive).
  // "2026-09-01 09:00:00" is not a valid ISO 8601 string — browsers parse it
  // inconsistently (Chrome: local time; Firefox: invalid → NaN).
  // Fix: replace the space with "T" so it becomes a valid local-time ISO string.
  // If it already ends with "Z" or "+HH:MM" we leave it alone — new Date() handles
  // those correctly and getHours()/getDate() will return local equivalents.
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const dt = new Date(normalized);
  const date = fmt(dt); // local YYYY-MM-DD — matches what MonthView cells generate
  const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  return { dt, date, time };
}

function toCalEvent(a: ApiAppointment): CalEvent {
  const { dt, date, time } = parseAppointmentDate(a.appointment_date);
  return {
    id:              a.id,
    date,
    time,
    datetime:        dt,
    title:           a.title,
    status:          a.status,
    patientName:     a.patient_name,
    doctorName:      a.doctor_name,
    doctorId:        a.doctor_id,
    appointmentType: a.appointment_type ?? "simple",
    durationMinutes: a.duration_minutes ?? 15,
    roomName:        a.room_name,
    patientId:       a.patient,
    notes:           a.notes ?? "",
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

function CalendarPage() {
  const queryClient = useQueryClient();
  const [view, setView]             = useState<View>("month");
  const [cursor, setCursor]         = useState(new Date());
  const [open, setOpen]             = useState(false);
  const [smartOpen, setSmartOpen]   = useState(false);
  const [myOnly, setMyOnly]         = useState(false);
  const [statusFilter, setStatus]   = useState<StatusFilter>("all");
  const [hoveredEvent, setHovered]  = useState<CalEvent | null>(null);
  const [selectedEvent, setSelected] = useState<CalEvent | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalEvent | null>(null);
  const [editForm, setEditForm]     = useState({
    title: "", date: "", time: "", notes: "",
  });
  const [form, setForm] = useState({
    title: "", date: fmt(new Date()), time: "09:00", notes: "", patient: "",
  });

  // ── Queries ──────────────────────────────────────────────────────────────────
  const meQuery           = useQuery({ queryKey: ["me"], queryFn: fetchCurrentUser });
  // Cache appointments for 5 minutes — fetchAllAppointments walks every page
  // and can fire 10-12 sequential requests.  After a mutation the query is
  // invalidated explicitly, so the 5-minute TTL only affects background
  // re-renders, not user-triggered changes.
  const appointmentsQuery = useQuery({
    queryKey: ["appointments-all"],
    queryFn: () => fetchAllAppointments(),
    staleTime: 5 * 60 * 1000,
  });
  // Patients and users change rarely — cache for 10 minutes.
  const patientsQuery     = useQuery({ queryKey: ["patients-all"], queryFn: fetchAllPatients, staleTime: 10 * 60 * 1000 });
  const usersQuery        = useQuery({ queryKey: ["users"], queryFn: fetchUsers, staleTime: 10 * 60 * 1000 });

  const me       = meQuery.data;
  const patients = patientsQuery.data ?? [];
  const isDoctor = me?.profile?.role === "doctor";
  const doctors  = (usersQuery.data ?? []).filter(
    (u) => u.profile?.role === "doctor",
  );

  // ── Events ───────────────────────────────────────────────────────────────────
  const allEvents = useMemo(
    () => (appointmentsQuery.data ?? []).map(toCalEvent),
    [appointmentsQuery.data],
  );

  const events = useMemo(() => {
    let ev = allEvents;
    if (myOnly && isDoctor && me) {
      ev = ev.filter((e) => e.doctorId === me.id);
    }
    if (statusFilter !== "all") {
      ev = ev.filter((e) => e.status === statusFilter);
    }
    return ev;
  }, [allEvents, myOnly, isDoctor, me, statusFilter]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  // Create
  const createMutation = useMutation({
    mutationFn: () =>
      createAppointment({
        patient: Number(form.patient),
        title:   form.title,
        appointment_date: new Date(`${form.date}T${form.time}:00`).toISOString(),
        reason:  form.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments-all"] });
      toast.success("Rendez-vous créé", { description: form.title });
      setOpen(false);
      setForm({ title: "", date: fmt(new Date()), time: "09:00", notes: "", patient: "" });
    },
    onError: () => toast.error("Impossible de créer le rendez-vous"),
  });

  // Update (edit form)
  const updateMutation = useMutation({
    mutationFn: () =>
      updateAppointment(selectedEvent!.id, {
        title:            editForm.title,
        appointment_date: new Date(`${editForm.date}T${editForm.time}:00`).toISOString(),
        notes:            editForm.notes,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments-all"] });
      toast.success("Rendez-vous modifié");
      setEditOpen(false);
      // Refresh the selected event in the detail panel
      setSelected(toCalEvent(updated));
    },
    onError: () => toast.error("Impossible de modifier le rendez-vous"),
  });

  // Status-only update
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppointmentStatus }) =>
      updateAppointment(id, { status }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments-all"] });
      const s = STATUS_STYLE[updated.status];
      toast.success(`Statut mis à jour : ${s?.label ?? updated.status}`);
      setSelected(toCalEvent(updated));
    },
    onError: () => toast.error("Impossible de mettre à jour le statut"),
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments-all"] });
      toast.success("Rendez-vous supprimé");
      setDeleteTarget(null);
      setSelected(null);
    },
    onError: () => toast.error("Impossible de supprimer le rendez-vous"),
  });

  // ── Navigation ────────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === "year")        d.setFullYear(d.getFullYear() + dir);
    else if (view === "month")  d.setMonth(d.getMonth() + dir);
    else                        d.setDate(d.getDate() + dir);
    setCursor(d);
  };

  const label =
    view === "year"  ? `${cursor.getFullYear()}` :
    view === "month" ? `${MOIS[cursor.getMonth()]} ${cursor.getFullYear()}` :
    cursor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const createEvent = () => {
    if (!form.title)   { toast.error("Le titre est requis"); return; }
    if (!form.patient) { toast.error("Le patient est requis"); return; }
    createMutation.mutate();
  };

  const openEdit = (e: CalEvent) => {
    setEditForm({ title: e.title, date: e.date, time: e.time, notes: e.notes });
    setEditOpen(true);
  };

  const handleEventClick = (e: CalEvent) => {
    setSelected(e);
    setHovered(null);
  };

  return (
    <AppShell
      title="Calendrier"
      actions={
        <>
          {/* View switcher */}
          <div className="flex rounded-lg border bg-background p-0.5">
            {(["day", "month", "year"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-sm rounded-md capitalize transition-colors ${
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "day" ? "Jour" : v === "month" ? "Mois" : "Année"}
              </button>
            ))}
          </div>

          {/* Smart RDV button */}
          <Button variant="outline" onClick={() => setSmartOpen(true)}>
            <Sparkles className="h-4 w-4" /> RDV Intelligent
          </Button>

          {/* Create dialog */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Nouveau RDV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un rendez-vous</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Titre</Label>
                  <Input
                    id="title" value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Consultation de suivi"
                  />
                </div>
                <div>
                  <Label>Patient</Label>
                  <Select value={form.patient} onValueChange={(v) => setForm({ ...form, patient: v })}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un patient" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edate">Date</Label>
                    <Input id="edate" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="etime">Heure</Label>
                    <Input id="etime" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="enotes">Motif / notes</Label>
                  <Textarea id="enotes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button onClick={createEvent} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {/* ── Smart appointment dialog ─────────────────────────────────────── */}
      <SmartAppointmentDialog
        open={smartOpen}
        onOpenChange={setSmartOpen}
        patients={patients}
        doctors={doctors}
        onBooked={(id) => {
          queryClient.invalidateQueries({ queryKey: ["appointments-all"] });
          toast.success("Rendez-vous intelligent créé", { description: `#${id}` });
        }}
      />

      {/* ── Edit dialog ───────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rendez-vous</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Titre</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date" type="date" value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-time">Heure</Label>
                <Input
                  id="edit-time" type="time" value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes" rows={3} value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rendez-vous ?</AlertDialogTitle>
            <AlertDialogDescription>
              «&nbsp;{deleteTarget?.title}&nbsp;» du {deleteTarget?.date} à {deleteTarget?.time} sera supprimé définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={`grid gap-4 ${selectedEvent ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <Card>
          <CardContent className="p-4 md:p-6 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Navigation */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigate(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <h2 className="text-base font-semibold ml-2 capitalize">{label}</h2>
              </div>

              {/* "Mes RDV" toggle — replaces Aujourd'hui for doctors, hidden for other roles */}
              {isDoctor ? (
                <button
                  onClick={() => setMyOnly((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    myOnly
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Stethoscope className="h-3.5 w-3.5" />
                  {myOnly ? "✓ Mes RDV" : "Mes RDV"}
                </button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                  Aujourd'hui
                </Button>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Status chips */}
              <div className="flex gap-1 flex-wrap">
                {STATUS_FILTERS.map((f) => {
                  const s = STATUS_STYLE[f.key];
                  const active = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setStatus(f.key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? f.key === "all"
                            ? "bg-gray-800 text-white border-gray-800"
                            : `${s.bg} ${s.text} border-current`
                          : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {f.key !== "all" && active && (
                        <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${s?.dot}`} />
                      )}
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Count */}
            {!appointmentsQuery.isLoading && (
              <p className="text-xs text-gray-400">
                {events.length} rendez-vous affiché{events.length > 1 ? "s" : ""}
                {myOnly && isDoctor ? " (mes RDV)" : ""}
                {statusFilter !== "all" ? ` · ${STATUS_STYLE[statusFilter]?.label}` : ""}
              </p>
            )}

            {/* Calendar body */}
            {appointmentsQuery.isLoading ? (
              <CalendarSkeleton />
            ) : (
              <>
                {view === "month" && (
                  <MonthView
                    cursor={cursor}
                    events={events}
                    hoveredEvent={hoveredEvent}
                    selectedEvent={selectedEvent}
                    onHover={setHovered}
                    onDayClick={(d) => { setCursor(d); setView("day"); }}
                    onEventClick={handleEventClick}
                  />
                )}
                {view === "year" && (
                  <YearView
                    year={cursor.getFullYear()}
                    events={events}
                    onPickMonth={(m) => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView("month"); }}
                  />
                )}
                {view === "day" && (
                  <DayView
                    cursor={cursor}
                    events={events}
                    selectedEvent={selectedEvent}
                    onEventClick={handleEventClick}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Event detail panel ─────────────────────────────────────────── */}
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelected(null)}
            onEdit={() => openEdit(selectedEvent)}
            onDelete={() => setDeleteTarget(selectedEvent)}
            onStatusChange={(status) =>
              statusMutation.mutate({ id: selectedEvent.id, status })
            }
            statusPending={statusMutation.isPending}
          />
        )}
      </div>
    </AppShell>
  );
}

// ─── EventDetailPanel ─────────────────────────────────────────────────────────

function EventDetailPanel({
  event, onClose, onEdit, onDelete, onStatusChange, statusPending,
}: {
  event: CalEvent;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: AppointmentStatus) => void;
  statusPending: boolean;
}) {
  const s = STATUS_STYLE[event.status] ?? STATUS_STYLE.scheduled;

  return (
    <Card className="self-start sticky top-4">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-semibold text-sm leading-snug">{event.title}</p>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info */}
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>
              {new Date(event.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{event.time} · {event.durationMinutes} min</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>{event.patientName}</span>
          </div>
          {event.doctorName && (
            <div className="flex items-center gap-2">
              <Stethoscope className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span>Dr. {event.doctorName}</span>
            </div>
          )}
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>
            {TYPE_LABELS[event.appointmentType] ?? event.appointmentType}
          </span>
          {event.roomName && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {event.roomName}
            </span>
          )}
        </div>

        {/* Notes */}
        {event.notes && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 leading-relaxed">
            {event.notes}
          </p>
        )}

        {/* Status transitions */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Changer le statut</p>
          <div className="grid grid-cols-2 gap-1.5">
            {STATUS_TRANSITIONS.filter((t) => t.status !== event.status).map((t) => {
              const ts = STATUS_STYLE[t.status];
              return (
                <button
                  key={t.status}
                  onClick={() => onStatusChange(t.status)}
                  disabled={statusPending}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${ts.bg} ${ts.text} hover:opacity-80 disabled:opacity-50`}
                >
                  {statusPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Modifier
          </Button>
          <Button
            variant="outline" size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── MonthView ────────────────────────────────────────────────────────────────

function MonthView({
  cursor, events, hoveredEvent, selectedEvent, onHover, onDayClick, onEventClick,
}: {
  cursor: Date;
  events: CalEvent[];
  hoveredEvent: CalEvent | null;
  selectedEvent: CalEvent | null;
  onHover: (e: CalEvent | null) => void;
  onDayClick: (d: Date) => void;
  onEventClick: (e: CalEvent) => void;
}) {
  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground mb-1">
        {JOURS_SEMAINE.map((j) => (
          <div key={j} className="p-2 text-center">{j}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border">
        {cells.map((c, i) => {
          const key       = c ? fmt(c) : `empty-${i}`;
          const dayEvents = c ? events.filter((e) => e.date === fmt(c)) : [];
          const isToday   = c && fmt(c) === fmt(new Date());
          const isWeekend = c && (c.getDay() === 0 || c.getDay() === 6);

          return (
            <div
              key={key}
              className={`bg-background min-h-[110px] p-1.5 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${
                isWeekend ? "bg-gray-50/60" : ""
              }`}
              onClick={() => c && onDayClick(c)}
            >
              {c && (
                <>
                  <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium mb-1 ${
                    isToday ? "bg-primary text-primary-foreground font-bold" : "text-gray-700"
                  }`}>
                    {c.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => {
                      const s = STATUS_STYLE[e.status] ?? STATUS_STYLE.scheduled;
                      const isSelected = selectedEvent?.id === e.id;
                      return (
                        <div
                          key={e.id}
                          className={`relative text-[11px] rounded px-1.5 py-0.5 truncate cursor-pointer transition-all ${s.bg} ${s.text} ${
                            isSelected ? "ring-2 ring-primary ring-offset-1" : "hover:brightness-95"
                          }`}
                          onMouseEnter={() => onHover(e)}
                          onMouseLeave={() => onHover(null)}
                          onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                          title={`${e.time} — ${e.patientName}${e.doctorName ? ` · Dr. ${e.doctorName}` : ""}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${s.dot}`} />
                          {e.time} {e.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[11px] text-muted-foreground pl-1">
                        +{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Hover tooltip (only when nothing is selected) */}
      {hoveredEvent && !selectedEvent && <EventPopover event={hoveredEvent} />}
    </div>
  );
}

// ─── EventPopover ─────────────────────────────────────────────────────────────

function EventPopover({ event }: { event: CalEvent }) {
  const s = STATUS_STYLE[event.status] ?? STATUS_STYLE.scheduled;
  return (
    <div className={`mt-3 rounded-xl border p-4 text-sm space-y-2 ${s.bg}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`font-semibold ${s.text}`}>{event.title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text} border border-current/20`}>
          {s.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {event.time} · {event.durationMinutes} min
        </span>
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
          {new Date(event.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
        </span>
        <span className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-gray-400" />
          {event.patientName}
        </span>
        {event.doctorName && (
          <span className="flex items-center gap-1.5">
            <Stethoscope className="h-3.5 w-3.5 text-gray-400" />
            Dr. {event.doctorName}
          </span>
        )}
      </div>
      <div className="flex gap-2 text-xs text-gray-500">
        <span className={`px-2 py-0.5 rounded-full ${s.bg} border border-current/10`}>
          {TYPE_LABELS[event.appointmentType] ?? event.appointmentType}
        </span>
        {event.roomName && (
          <span className="px-2 py-0.5 rounded-full bg-white/60 border border-gray-200">
            {event.roomName}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── YearView ─────────────────────────────────────────────────────────────────

function YearView({
  year, events, onPickMonth,
}: {
  year: number;
  events: CalEvent[];
  onPickMonth: (m: number) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MOIS.map((m, idx) => {
        const daysInMonth = new Date(year, idx + 1, 0).getDate();
        const startOffset = new Date(year, idx, 1).getDay();
        const cells: (number | null)[] = Array(startOffset).fill(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        const monthPrefix = `${year}-${String(idx + 1).padStart(2, "0")}`;
        const monthCount  = events.filter((e) => e.date.startsWith(monthPrefix)).length;

        return (
          <button
            key={m}
            onClick={() => onPickMonth(idx)}
            className="rounded-xl border p-3 text-left hover:border-primary hover:shadow-sm transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800 group-hover:text-primary transition-colors">
                {m}
              </p>
              {monthCount > 0 && (
                <span className="text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
                  {monthCount}
                </span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground">
              {JOURS_SEMAINE.map((j) => (
                <div key={j} className="text-center">{j[0]}</div>
              ))}
              {cells.map((c, i) => {
                const dateStr = c ? `${monthPrefix}-${String(c).padStart(2, "0")}` : null;
                const hasDot  = dateStr ? events.some((e) => e.date === dateStr) : false;
                return (
                  <div key={i} className="text-center py-0.5 relative">
                    <span className={c ? "text-foreground" : ""}>{c ?? ""}</span>
                    {hasDot && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── DayView ──────────────────────────────────────────────────────────────────

function DayView({
  cursor, events, selectedEvent, onEventClick,
}: {
  cursor: Date;
  events: CalEvent[];
  selectedEvent: CalEvent | null;
  onEventClick: (e: CalEvent) => void;
}) {
  const dayStr    = fmt(cursor);
  const dayEvents = events
    .filter((e) => e.date === dayStr)
    .sort((a, b) => a.time.localeCompare(b.time));
  const hours     = Array.from({ length: 11 }, (_, i) => i + 8); // 08h–18h
  const SLOT_H    = 64; // px per hour

  function topForTime(time: string) {
    const [h, m] = time.split(":").map(Number);
    return ((h - 8) + m / 60) * SLOT_H;
  }
  function heightForDuration(minutes: number) {
    return Math.max((minutes / 60) * SLOT_H, 24);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[60px_1fr]">
      {/* Time column */}
      <div className="space-y-0 text-xs text-muted-foreground text-right pr-2 pt-2">
        {hours.map((h) => (
          <div key={h} style={{ height: SLOT_H }} className="flex items-start justify-end pr-2">
            {h}h00
          </div>
        ))}
      </div>

      {/* Events column */}
      <div className="border-l relative" style={{ height: hours.length * SLOT_H }}>
        {/* Hour lines */}
        {hours.map((h) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-dashed border-gray-100"
            style={{ top: (h - 8) * SLOT_H }}
          />
        ))}

        <NowIndicator hours={hours} slotH={SLOT_H} />

        {dayEvents.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Aucun rendez-vous ce jour.</p>
          </div>
        )}

        {dayEvents.map((e, idx) => {
          const s          = STATUS_STYLE[e.status] ?? STATUS_STYLE.scheduled;
          const top        = topForTime(e.time);
          const h          = heightForDuration(e.durationMinutes);
          const isSelected = selectedEvent?.id === e.id;
          return (
            <div
              key={e.id}
              className={`absolute left-2 right-2 rounded-lg px-3 py-2 text-xs shadow-sm border cursor-pointer transition-all ${s.bg} ${s.text} overflow-hidden ${
                isSelected ? "ring-2 ring-primary ring-offset-1" : "hover:brightness-95"
              }`}
              style={{ top, height: h, zIndex: 10 + idx }}
              onClick={() => onEventClick(e)}
              title={`${e.patientName} · ${e.durationMinutes} min`}
            >
              <p className="font-semibold truncate">{e.time} — {e.title}</p>
              <div className="flex items-center gap-3 mt-0.5 opacity-80">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {e.patientName}
                </span>
                {e.doctorName && (
                  <span className="flex items-center gap-1">
                    <Stethoscope className="h-3 w-3" />
                    Dr. {e.doctorName}
                  </span>
                )}
              </div>
              {h > 40 && (
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-full bg-white/50 text-[10px]">
                    {TYPE_LABELS[e.appointmentType] ?? e.appointmentType}
                  </span>
                  {e.roomName && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/50 text-[10px]">
                      {e.roomName}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NowIndicator ─────────────────────────────────────────────────────────────

function NowIndicator({ hours, slotH }: { hours: number[]; slotH: number }) {
  const now  = new Date();
  const minH = hours[0];
  const maxH = hours[hours.length - 1] + 1;
  const h    = now.getHours() + now.getMinutes() / 60;
  if (h < minH || h > maxH) return null;
  const top = (h - minH) * slotH;
  return (
    <div className="absolute inset-x-0 flex items-center gap-1 pointer-events-none" style={{ top }}>
      <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0 -ml-1.5" />
      <div className="flex-1 h-px bg-red-400" />
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded" />
        ))}
      </div>
    </div>
  );
}