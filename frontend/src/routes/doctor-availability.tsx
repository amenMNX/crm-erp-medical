/**
 * src/routes/doctor-availability.tsx
 *
 * Staff UI for managing DoctorAvailability — the weekly schedule blocks that
 * control which slots appear in the patient portal booking wizard.
 *
 * Route: /doctor-availability
 * Access: admin / secretary / manager  (backend enforces permissions)
 *
 * Layout:
 *  Left column  — doctor selector (searchable list)
 *  Right panel  — weekly grid + add/delete availability blocks
 *
 * This file replaces the "missing link" identified in the previous session:
 * the portal wizard calls GET /portal/doctors/<id>/slots/ which relies on
 * DoctorAvailability rows — but there was no UI to create them. This is it.
 */

import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Loader2,
  Plus,
  Trash2,
  CalendarDays,
  Search,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  DoorOpen,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  fetchDoctors,
  fetchDoctorAvailability,
  fetchAppointmentRooms,
  addAvailabilityBlock,
  deleteAvailabilityBlock,
  DAY_LABELS,
  DAY_SHORT,
  displayTime,
  fmtTime,
  type ApiAvailability,
  type ApiRoom,
  type DayOfWeek,
} from "@/lib/doctor-availability-api";
import type { ApiUser } from "@/lib/users-api";

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/doctor-availability")({
  head: () => ({
    meta: [
      { title: "Disponibilités médecins" },
      { name: "description", content: "Gérez les plages horaires hebdomadaires des médecins." },
    ],
  }),
  component: DoctorAvailabilityPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [0, 1, 2, 3, 4, 5] as DayOfWeek[];

/** Quick-pick presets for common time ranges */
const TIME_PRESETS = [
  { label: "Matin 8h–12h",       start: "08:00", end: "12:00" },
  { label: "Matin 8h–12h30",     start: "08:00", end: "12:30" },
  { label: "Après-midi 13h–17h", start: "13:00", end: "17:00" },
  { label: "Après-midi 14h–18h", start: "14:00", end: "18:00" },
  { label: "Journée 8h–17h",     start: "08:00", end: "17:00" },
  { label: "Samedi 9h–12h",      start: "09:00", end: "12:00" },
  { label: "Personnalisé",        start: "",      end: "" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function doctorFullName(u: ApiUser) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return name ? `Dr. ${name}` : `Dr. ${u.username}`;
}

/** Group availability blocks by day_of_week */
function groupByDay(blocks: ApiAvailability[]): Record<number, ApiAvailability[]> {
  const grouped: Record<number, ApiAvailability[]> = {};
  for (const b of blocks) {
    (grouped[b.day_of_week] ??= []).push(b);
  }
  // Sort blocks within each day by start_time
  for (const day of Object.keys(grouped)) {
    grouped[+day].sort((a, b) => a.start_time.localeCompare(b.start_time));
  }
  return grouped;
}

/** How many slots fit in a block (for info display) */
function countSlots(block: ApiAvailability, durationMinutes = 15, gapMinutes = 5): number {
  const [sh, sm] = block.start_time.split(":").map(Number);
  const [eh, em] = block.end_time.split(":").map(Number);
  const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMinutes <= 0) return 0;
  return Math.floor(totalMinutes / (durationMinutes + gapMinutes));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DoctorAvailabilityPage() {
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [doctorSearch, setDoctorSearch] = useState("");

  const doctorsQuery = useQuery({
    queryKey: ["doctors"],
    queryFn: fetchDoctors,
  });

  const doctors = doctorsQuery.data ?? [];

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      doctorFullName(d).toLowerCase().includes(q) ||
      d.username.toLowerCase().includes(q) ||
      (d.profile?.department ?? "").toLowerCase().includes(q)
    );
  }, [doctors, doctorSearch]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? null;

  return (
    <AppShell>
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-semibold">Disponibilités médecins</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Configurez les plages horaires hebdomadaires — elles définissent les créneaux
                proposés aux patients dans l'espace de prise de RDV en ligne.
              </p>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex gap-6 items-start">
          {/* Left: doctor list */}
          <DoctorList
            doctors={filteredDoctors}
            search={doctorSearch}
            onSearchChange={setDoctorSearch}
            selectedId={selectedDoctorId}
            onSelect={setSelectedDoctorId}
            loading={doctorsQuery.isLoading}
          />

          {/* Right: availability grid */}
          <div className="flex-1 min-w-0">
            {selectedDoctorId && selectedDoctor ? (
              <AvailabilityPanel doctor={selectedDoctor} />
            ) : (
              <EmptySelection />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Doctor list (left column) ────────────────────────────────────────────────

function DoctorList({
  doctors,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  loading,
}: {
  doctors: ApiUser[];
  search: string;
  onSearchChange: (v: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
}) {
  return (
    <Card className="w-64 shrink-0">
      <CardContent className="p-3 flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun médecin trouvé
          </p>
        ) : (
          <div className="flex flex-col gap-1 max-h-[calc(100vh-260px)] overflow-y-auto">
            {doctors.map((doc) => (
              <DoctorListItem
                key={doc.id}
                doctor={doc}
                selected={doc.id === selectedId}
                onClick={() => onSelect(doc.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DoctorListItem({
  doctor,
  selected,
  onClick,
}: {
  doctor: ApiUser;
  selected: boolean;
  onClick: () => void;
}) {
  // Check if this doctor has any availability (we don't load it here —
  // the parent panel handles that — but we can show an indicator if needed).
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground",
      ].join(" ")}
    >
      <span className="font-medium block truncate">{doctorFullName(doctor)}</span>
      {doctor.profile?.department && (
        <span
          className={[
            "text-xs block truncate",
            selected ? "text-primary-foreground/70" : "text-muted-foreground",
          ].join(" ")}
        >
          {doctor.profile.department}
        </span>
      )}
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySelection() {
  return (
    <Card className="flex flex-col items-center justify-center py-20 text-center">
      <UserCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <p className="text-muted-foreground font-medium">Sélectionnez un médecin</p>
      <p className="text-sm text-muted-foreground mt-1">
        Choisissez un médecin dans la liste pour voir et modifier ses disponibilités.
      </p>
    </Card>
  );
}

// ─── Availability panel (right) ───────────────────────────────────────────────

function AvailabilityPanel({ doctor }: { doctor: ApiUser }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const availQuery = useQuery({
    queryKey: ["availability", doctor.id],
    queryFn: () => fetchDoctorAvailability(doctor.id),
  });

  const roomsQuery = useQuery({
    queryKey: ["appointment-rooms"],
    queryFn: fetchAppointmentRooms,
    staleTime: 5 * 60 * 1000,
  });

  const rooms = roomsQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteAvailabilityBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability", doctor.id] });
      toast.success("Plage supprimée");
    },
    onError: () => toast.error("Impossible de supprimer cette plage"),
  });

  const addMutation = useMutation({
    mutationFn: (payload: Parameters<typeof addAvailabilityBlock>[1]) =>
      addAvailabilityBlock(doctor.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["availability", doctor.id] });
      setAddOpen(false);
      toast.success("Plage ajoutée");
    },
    onError: () => toast.error("Impossible d'ajouter cette plage"),
  });

  const blocks = availQuery.data ?? [];
  const grouped = groupByDay(blocks);
  const hasAnyBlock = blocks.length > 0;

  // Total bookable slots this week (simple estimate, 15-min slots)
  const totalSlots = blocks.reduce((acc, b) => acc + countSlots(b), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{doctorFullName(doctor)}</h2>
          <p className="text-sm text-muted-foreground">
            {doctor.profile?.department ?? "Médecin"}
          </p>
        </div>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Ajouter une plage
            </Button>
          </DialogTrigger>
          <AddBlockDialog
            doctorId={doctor.id}
            rooms={rooms}
            onSubmit={(payload) => addMutation.mutate(payload)}
            submitting={addMutation.isPending}
          />
        </Dialog>
      </div>

      {/* Status banner */}
      {availQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement des disponibilités…
        </div>
      ) : !hasAnyBlock ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Aucune disponibilité configurée</p>
            <p className="mt-0.5 text-amber-700">
              Ce médecin n'apparaîtra pas dans le portail patient tant qu'aucune plage
              horaire n'est définie. Ajoutez au moins un créneau pour le rendre disponible.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">{blocks.length} plage{blocks.length > 1 ? "s" : ""}</span>
            {" "}sur {Object.keys(grouped).length} jour{Object.keys(grouped).length > 1 ? "s" : ""}
            {" "}— environ{" "}
            <span className="font-medium">{totalSlots} créneaux</span> disponibles / semaine
            <span className="text-emerald-600"> (consultations simples 15 min)</span>
          </span>
        </div>
      )}

      {/* Weekly grid */}
      <div className="grid grid-cols-1 gap-3">
        {DAYS.map((day) => (
          <DayRow
            key={day}
            day={day}
            blocks={grouped[day] ?? []}
            onDelete={(id) => deleteMutation.mutate(id)}
            deleting={deleteMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Day row ──────────────────────────────────────────────────────────────────

function DayRow({
  day,
  blocks,
  onDelete,
  deleting,
}: {
  day: DayOfWeek;
  blocks: ApiAvailability[];
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const isEmpty = blocks.length === 0;

  return (
    <Card className={isEmpty ? "opacity-50" : ""}>
      <CardContent className="p-3 flex items-center gap-4">
        {/* Day label */}
        <div className="w-20 shrink-0">
          <span className="font-semibold text-sm">{DAY_LABELS[day]}</span>
        </div>

        {/* Blocks or empty */}
        <div className="flex-1 flex flex-wrap gap-2 min-h-[2rem] items-center">
          {isEmpty ? (
            <span className="text-xs text-muted-foreground italic">Jour non travaillé</span>
          ) : (
            blocks.map((block) => (
              <AvailabilityBlock
                key={block.id}
                block={block}
                onDelete={onDelete}
                deleting={deleting}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Single availability block badge ─────────────────────────────────────────

function AvailabilityBlock({
  block,
  onDelete,
  deleting,
}: {
  block: ApiAvailability;
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const slots = countSlots(block);

  return (
    <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm">
      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="font-medium tabular-nums">
        {displayTime(block.start_time)} – {displayTime(block.end_time)}
      </span>
      <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
        ~{slots} créneaux
      </Badge>
      {block.room_name && (
        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 gap-1">
          <DoorOpen className="h-3 w-3" />
          {block.room_name}
        </Badge>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            type="button"
            disabled={deleting}
            className="ml-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
            aria-label="Supprimer cette plage"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette plage ?</AlertDialogTitle>
            <AlertDialogDescription>
              La plage <strong>{DAY_LABELS[block.day_of_week]} {displayTime(block.start_time)}–{displayTime(block.end_time)}</strong> sera
              supprimée. Les rendez-vous déjà pris dans ce créneau ne sont pas affectés,
              mais aucun nouveau créneau ne sera proposé pour cette plage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(block.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Add block dialog ─────────────────────────────────────────────────────────

function AddBlockDialog({
  doctorId,
  rooms,
  onSubmit,
  submitting,
}: {
  doctorId: number;
  rooms: ApiRoom[];
  onSubmit: (payload: { day_of_week: DayOfWeek; start_time: string; end_time: string; room?: number | null }) => void;
  submitting: boolean;
}) {
  const [day, setDay] = useState<DayOfWeek>(0);
  const [preset, setPreset] = useState<string>("Matin 8h–12h");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("12:00");
  const [roomId, setRoomId] = useState<string>("none");

  function applyPreset(label: string) {
    setPreset(label);
    const p = TIME_PRESETS.find((t) => t.label === label);
    if (p && p.start) {
      setStart(p.start);
      setEnd(p.end);
    }
  }

  function handleSubmit() {
    if (!start || !end || start >= end) return;
    onSubmit({
      day_of_week: day,
      start_time: start,
      end_time: end,
      room: roomId !== "none" ? Number(roomId) : null,
    });
  }

  const invalid = start >= end;
  const selectedRoom = rooms.find((r) => String(r.id) === roomId);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nouvelle plage de disponibilité
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {/* Day */}
        <div className="flex flex-col gap-1.5">
          <Label>Jour</Label>
          <Select
            value={String(day)}
            onValueChange={(v) => setDay(+v as DayOfWeek)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {DAY_LABELS[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Preset */}
        <div className="flex flex-col gap-1.5">
          <Label>Horaire</Label>
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_PRESETS.map((p) => (
                <SelectItem key={p.label} value={p.label}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom time inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="start-time">Début</Label>
            <Input
              id="start-time"
              type="time"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPreset("Personnalisé");
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="end-time">Fin</Label>
            <Input
              id="end-time"
              type="time"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setPreset("Personnalisé");
              }}
            />
          </div>
        </div>

        {/* Room select */}
        <div className="flex flex-col gap-1.5">
          <Label className="flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Salle de RDV <span className="text-muted-foreground font-normal">(optionnel)</span>
          </Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger>
              <SelectValue placeholder="Aucune salle spécifique" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucune salle spécifique</SelectItem>
              {/* Group by usage */}
              {(["patient_appointment", "medicalized", "operation_room"] as const).map((usage) => {
                const group = rooms.filter((r) => r.usage === usage);
                if (group.length === 0) return null;
                const groupLabels: Record<string, string> = {
                  patient_appointment: "Salles de rendez-vous",
                  medicalized: "Chambres médicalisées",
                  operation_room: "Salles d'opération",
                };
                return (
                  <div key={usage}>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupLabels[usage]}
                    </div>
                    {group.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                        {r.specialty ? ` — ${r.specialty}` : ""}
                        {r.location ? ` (${r.location})` : ""}
                      </SelectItem>
                    ))}
                  </div>
                );
              })}
            </SelectContent>
          </Select>
          {rooms.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucune salle de RDV ou d'opération active. Créez des salles dans la section Salles.
            </p>
          )}
        </div>

        {/* Validation error */}
        {invalid && (
          <p className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            L'heure de fin doit être postérieure à l'heure de début.
          </p>
        )}

        {/* Preview */}
        {!invalid && start && end && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {DAY_LABELS[day]} {displayTime(start)} – {displayTime(end)}
            </span>
            {" "}— environ{" "}
            <span className="font-medium text-foreground">
              {countSlots({ start_time: start + ":00", end_time: end + ":00" } as ApiAvailability)} créneaux
            </span>{" "}
            de 15 min disponibles
            {selectedRoom && (
              <span className="ml-1">· <span className="font-medium text-foreground">{selectedRoom.name}</span></span>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => {}}>
          Annuler
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || invalid || !start || !end}
          className="gap-1.5"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Ajouter
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}