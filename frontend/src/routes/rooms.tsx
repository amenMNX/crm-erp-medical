// src/routes/rooms.tsx
// Room management — usage labels, capacity, availability, patient bookings, machine assignment

import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Scissors,
  CalendarDays,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  Clock,
  Building2,
  Eye,
  Package,
  Stethoscope,
  Wrench,
  DoorOpen,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/rooms")({
  component: RoomsPage,
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

type RoomStatus  = "active" | "maintenance" | "closed";
type RoomUsage   = "medicalized" | "patient_appointment" | "operation_room" | "stock";
type BookingStatus = "confirmed" | "pending" | "cancelled" | "completed";

type ApiRoom = {
  id: number;
  name: string;
  usage: RoomUsage;
  specialty: string;
  location: string;
  capacity: number;
  status: RoomStatus;
  is_available: boolean;
  bookings_allowed: boolean;
  active_bookings: number;
  machines_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type ApiBooking = {
  id: number;
  room: number;
  room_name: string;
  room_capacity: number;
  patient: number;
  patient_name: string;
  occupants: number;
  notes_companions: string;
  start_datetime: string;
  end_datetime: string;
  status: BookingStatus;
  reason: string;
  notes: string;
  booked_by: number | null;
  booked_by_name: string | null;
  created_at: string;
  conflict_warning?: string;
};

type ApiPatient = { id: number; first_name: string; last_name: string };

type ApiMachine = {
  id: number;
  name: string;
  model: string;
  status: string;
  room: number | null;
  room_name: string | null;
  location: string;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  API helpers                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

const fetchRooms = (): Promise<ApiRoom[]> =>
  apiFetch<ApiRoom[] | { results: ApiRoom[] }>("/crm/rooms/").then((d) =>
    Array.isArray(d) ? d : d.results
  );

const fetchBookings = (): Promise<ApiBooking[]> =>
  apiFetch<ApiBooking[] | { results: ApiBooking[] }>("/crm/room-bookings/").then(
    (d) => (Array.isArray(d) ? d : d.results)
  );

const fetchPatients = (): Promise<ApiPatient[]> =>
  apiFetch<ApiPatient[] | { results: ApiPatient[] }>("/crm/patients/?page_size=500").then(
    (d) => (Array.isArray(d) ? d : d.results)
  );

const fetchMachines = (): Promise<ApiMachine[]> =>
  apiFetch<ApiMachine[] | { results: ApiMachine[] }>("/crm/machines/?page_size=500").then(
    (d) => (Array.isArray(d) ? d : d.results)
  );

const createRoom   = (data: Partial<ApiRoom>): Promise<ApiRoom> =>
  apiFetch("/crm/rooms/", { method: "POST", body: data });

const updateRoom   = (id: number, data: Partial<ApiRoom>): Promise<ApiRoom> =>
  apiFetch(`/crm/rooms/${id}/`, { method: "PATCH", body: data });

const deleteRoom   = (id: number): Promise<void> =>
  apiFetch(`/crm/rooms/${id}/`, { method: "DELETE" });

const createBooking = (data: Partial<ApiBooking>): Promise<ApiBooking> =>
  apiFetch("/crm/room-bookings/", { method: "POST", body: data });

const updateBooking = (id: number, data: Partial<ApiBooking>): Promise<ApiBooking> =>
  apiFetch(`/crm/room-bookings/${id}/`, { method: "PATCH", body: data });

const assignMachineRoom = (machineId: number, roomId: number | null): Promise<ApiMachine> =>
  apiFetch(`/crm/machines/${machineId}/`, { method: "PATCH", body: { room: roomId } });

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

const USAGE_META: Record<
  RoomUsage,
  { label: string; icon: React.ElementType; color: string; bg: string; desc: string }
> = {
  medicalized: {
    label: "Chambre médicalisée",
    icon: BedDouble,
    color: "text-violet-700",
    bg: "bg-violet-50 border-violet-200",
    desc: "Accueil post-opératoire, hospitalisation d'une nuit ou plus.",
  },
  patient_appointment: {
    label: "Salle de rendez-vous",
    icon: Stethoscope,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200",
    desc: "Consultations, radiologie, ophtalmologie, etc.",
  },
  operation_room: {
    label: "Salle d'opération",
    icon: Scissors,
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    desc: "Bloc opératoire chirurgical. Réservations et machines autorisées.",
  },
  stock: {
    label: "Stock / Local technique",
    icon: Package,
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    desc: "Stockage de matériel. Les machines sont assignées ici.",
  },
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmée",
  pending:   "En attente",
  cancelled: "Annulée",
  completed: "Terminée",
};

const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending:   "bg-amber-100 text-amber-700 border-amber-200",
  cancelled: "bg-rose-100 text-rose-600 border-rose-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString("fr-TN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toLocalInput(iso: string) {
  return iso ? iso.slice(0, 16) : "";
}

function toIso(local: string) {
  return local ? new Date(local).toISOString() : "";
}

function occupantsLabel(n: number) {
  if (n <= 1) return "Patient seul";
  return `Patient + ${n - 1} accompagnant${n > 2 ? "s" : ""}`;
}

function roomStatusBadge(room: ApiRoom) {
  if (room.status === "maintenance")
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]">
        Maintenance
      </Badge>
    );
  if (room.status === "closed")
    return (
      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-600 text-[10px]">
        Fermée
      </Badge>
    );
  if (room.active_bookings > 0 && room.bookings_allowed)
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 text-[10px]">
        Occupée
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px]">
      Disponible
    </Badge>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RoomFormDialog                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */

function RoomFormDialog({
  open, onClose, initial, onSave, isPending,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ApiRoom>;
  onSave: (data: Partial<ApiRoom>) => void;
  isPending: boolean;
}) {
  const [name,      setName]      = useState(initial?.name ?? "");
  const [usage,     setUsage]     = useState<RoomUsage>(initial?.usage ?? "patient_appointment");
  const [specialty, setSpecialty] = useState(initial?.specialty ?? "");
  const [location,  setLocation]  = useState(initial?.location ?? "");
  const [capacity,  setCapacity]  = useState(String(initial?.capacity ?? "1"));
  const [status,    setStatus]    = useState<RoomStatus>(initial?.status ?? "active");
  const [notes,     setNotes]     = useState(initial?.notes ?? "");

  const isEdit = Boolean(initial?.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Le nom est obligatoire"); return; }
    const cap = usage === "stock" ? 0 : parseInt(capacity, 10);
    if (usage !== "stock" && (isNaN(cap) || cap < 1)) {
      toast.error("La capacité doit être ≥ 1");
      return;
    }
    onSave({
      name: name.trim(),
      usage,
      specialty: usage === "patient_appointment" ? specialty.trim() : "",
      location,
      capacity: usage === "stock" ? 0 : cap,
      status,
      notes,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier la salle" : "Nouvelle salle"}</DialogTitle>
          </DialogHeader>

          {/* Usage selector — big cards */}
          <div>
            <Label className="mb-2 block">Type d'usage *</Label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(USAGE_META) as [RoomUsage, (typeof USAGE_META)[RoomUsage]][]).map(
                ([key, m]) => {
                  const Icon   = m.icon;
                  const active = usage === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setUsage(key)}
                      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                        active
                          ? `${m.bg} border-2 ring-1 ring-offset-0`
                          : "border hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          active ? m.bg : "bg-muted"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${active ? m.color : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${active ? m.color : ""}`}>{m.label}</p>
                        <p className="text-xs text-muted-foreground">{m.desc}</p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Nom *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Chambre 12, Salle Radio A, Local B"
              />
            </div>

            {usage === "patient_appointment" && (
              <div className="col-span-2 space-y-1">
                <Label>Spécialité</Label>
                <Input
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Ex : Radiologie, Ophtalmologie, Consultation générale"
                />
              </div>
            )}

            {usage !== "stock" && (
              <div className="space-y-1">
                <Label>Capacité (personnes) *</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Patient + accompagnants</p>
              </div>
            )}

            <div className={`space-y-1 ${usage === "stock" ? "col-span-2" : ""}`}>
              <Label>Localisation</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Bâtiment / étage / aile"
              />
            </div>

            <div className="space-y-1">
              <Label>Statut</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RoomStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">En maintenance</SelectItem>
                  <SelectItem value="closed">Fermée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────────────── */
/*  Extra types — Operation bookings                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

type ApiEmployee = {
  id: number;
  first_name: string;
  last_name: string;
  job_title: string;
};

type StaffRow = {
  employee: string; // employee id as string for select
  role: string;
};

type ApiOperationBooking = {
  id: number;
  room: number;
  room_name: string;
  patient: number;
  patient_name: string;
  with_donor: boolean;
  donor_patient: number | null;
  donor_patient_name: string | null;
  start_datetime: string;
  end_datetime: string;
  status: BookingStatus;
  operation_type: string;
  notes: string;
  booked_by: number | null;
  booked_by_name: string | null;
  staff_assignments: { id?: number; employee: number; employee_name?: string; role: string }[];
  conflict_warning?: string;
};

type OpBookingPayload = {
  room: number;
  patient: number;
  with_donor: boolean;
  donor_patient: number | null;
  start_datetime: string;
  end_datetime: string;
  status: BookingStatus;
  operation_type: string;
  notes: string;
  staff: { employee: number; role: string }[];
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  API helpers — Operation bookings                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

const fetchEmployees = (): Promise<ApiEmployee[]> =>
  apiFetch<ApiEmployee[] | { results: ApiEmployee[] }>("/hr/employees/?page_size=500&is_active=true").then(
    (d) => (Array.isArray(d) ? d : (d as { results: ApiEmployee[] }).results ?? [])
  );

const fetchOpBookings = (): Promise<ApiOperationBooking[]> =>
  apiFetch<ApiOperationBooking[] | { results: ApiOperationBooking[] }>("/crm/operation-bookings/").then(
    (d) => (Array.isArray(d) ? d : d.results)
  );

const createOpBooking = (data: OpBookingPayload): Promise<ApiOperationBooking> =>
  apiFetch("/crm/operation-bookings/", { method: "POST", body: data });

const updateOpBooking = (id: number, data: Partial<OpBookingPayload>): Promise<ApiOperationBooking> =>
  apiFetch(`/crm/operation-bookings/${id}/`, { method: "PATCH", body: data });

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Constants                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

const OPERATION_ROLES = [
  "Chirurgien principal",
  "Chirurgien assistant",
  "Anesthésiste",
  "Infirmier(e) de bloc",
  "Instrumentiste",
  "Aide-soignant(e)",
  "Technicien(ne) de bloc",
  "Autre",
];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  BookingFormDialog                                                           */
/*  — regular rooms  : patient + companions + dates                            */
/*  — operation rooms: patient(s) + staff assignments + operation type         */
/* ─────────────────────────────────────────────────────────────────────────── */

function BookingFormDialog({
  open, onClose, rooms, patients, employees,
  initialBooking, initialOpBooking,
  preselectedRoomId,
  onSaveBooking, onSaveOpBooking,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  rooms: ApiRoom[];
  patients: ApiPatient[];
  employees: ApiEmployee[];
  initialBooking?: Partial<ApiBooking>;
  initialOpBooking?: Partial<ApiOperationBooking>;
  preselectedRoomId?: number;
  onSaveBooking: (data: Partial<ApiBooking>) => void;
  onSaveOpBooking: (data: OpBookingPayload) => void;
  isPending: boolean;
}) {
  const bookableRooms = rooms.filter(
    (r) => r.bookings_allowed && r.status === "active"
  );

  // Determine initial room — prefer preselected, then initial data, then first bookable
  const initialRoomId = String(
    preselectedRoomId ??
    initialBooking?.room ??
    initialOpBooking?.room ??
    bookableRooms[0]?.id ?? ""
  );

  const [roomId, setRoomId] = useState<string>(initialRoomId);

  const selectedRoom = bookableRooms.find((r) => r.id === Number(roomId));
  const isOpRoom = selectedRoom?.usage === "operation_room";

  /* ── Regular booking state ─────────────────────────────────────────────── */
  const [patientId,  setPatientId]  = useState<string>(String(initialBooking?.patient ?? ""));
  const [occupants,  setOccupants]  = useState<string>(String(initialBooking?.occupants ?? "1"));
  const [companions, setCompanions] = useState(initialBooking?.notes_companions ?? "");
  const [reason,     setReason]     = useState(initialBooking?.reason ?? "");

  /* ── Operation booking state ───────────────────────────────────────────── */
  const [opPatientId,  setOpPatientId]  = useState<string>(String(initialOpBooking?.patient ?? ""));
  const [withDonor,    setWithDonor]    = useState(initialOpBooking?.with_donor ?? false);
  const [donorId,      setDonorId]      = useState<string>(
    initialOpBooking?.donor_patient ? String(initialOpBooking.donor_patient) : ""
  );
  const [opType,       setOpType]       = useState(initialOpBooking?.operation_type ?? "");
  const [staffRows,    setStaffRows]    = useState<StaffRow[]>(
    initialOpBooking?.staff_assignments?.length
      ? initialOpBooking.staff_assignments.map((s) => ({
          employee: String(s.employee),
          role: s.role,
        }))
      : [{ employee: "", role: OPERATION_ROLES[0] }]
  );

  /* ── Shared state ──────────────────────────────────────────────────────── */
  const [start,   setStart]   = useState(toLocalInput(initialBooking?.start_datetime ?? initialOpBooking?.start_datetime ?? ""));
  const [end,     setEnd]     = useState(toLocalInput(initialBooking?.end_datetime ?? initialOpBooking?.end_datetime ?? ""));
  const [bStatus, setBStatus] = useState<BookingStatus>(
    initialBooking?.status ?? initialOpBooking?.status ?? "confirmed"
  );
  const [notes, setNotes] = useState(initialBooking?.notes ?? initialOpBooking?.notes ?? "");

  const isEdit = Boolean(initialBooking?.id ?? initialOpBooking?.id);
  const meta   = selectedRoom ? USAGE_META[selectedRoom.usage] : null;

  /* ── Staff rows helpers ────────────────────────────────────────────────── */
  function addStaffRow() {
    setStaffRows((prev) => [...prev, { employee: "", role: OPERATION_ROLES[0] }]);
  }
  function removeStaffRow(idx: number) {
    setStaffRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateStaffRow(idx: number, field: keyof StaffRow, value: string) {
    setStaffRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  }

  /* ── Submit ────────────────────────────────────────────────────────────── */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomId) { toast.error("Salle obligatoire"); return; }
    if (!start || !end) { toast.error("Les dates sont obligatoires"); return; }

    if (isOpRoom) {
      // Operation room path
      if (!opPatientId) { toast.error("Patient (receveur) obligatoire"); return; }
      if (withDonor && !donorId) { toast.error("Patient donneur obligatoire"); return; }
      if (withDonor && donorId === opPatientId) {
        toast.error("Le donneur ne peut pas être le même patient que le receveur");
        return;
      }
      const validStaff = staffRows.filter((r) => r.employee !== "");
      onSaveOpBooking({
        room: Number(roomId),
        patient: Number(opPatientId),
        with_donor: withDonor,
        donor_patient: withDonor && donorId ? Number(donorId) : null,
        start_datetime: toIso(start),
        end_datetime: toIso(end),
        status: bStatus,
        operation_type: opType.trim(),
        notes,
        staff: validStaff.map((r) => ({ employee: Number(r.employee), role: r.role })),
      });
    } else {
      // Regular booking path
      if (!patientId) { toast.error("Patient obligatoire"); return; }
      const occ = parseInt(occupants, 10);
      if (isNaN(occ) || occ < 1) { toast.error("Nombre d'occupants invalide"); return; }
      const maxOcc = selectedRoom?.capacity ?? 1;
      if (occ > maxOcc) { toast.error(`Capacité maximale : ${maxOcc}`); return; }
      onSaveBooking({
        room: Number(roomId),
        patient: Number(patientId),
        occupants: occ,
        notes_companions: companions,
        start_datetime: toIso(start),
        end_datetime: toIso(end),
        status: bStatus,
        reason,
        notes,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Modifier la réservation" : "Nouvelle réservation"}
            </DialogTitle>
          </DialogHeader>

          {/* ── Room selector ─────────────────────────────────────────────── */}
          <div className="space-y-1">
            <Label>Salle *</Label>
            <Select
              value={roomId}
              onValueChange={(v) => {
                setRoomId(v);
                setOccupants("1");
              }}
            >
              <SelectTrigger><SelectValue placeholder="Choisir une salle" /></SelectTrigger>
              <SelectContent>
                {bookableRooms.length === 0 && (
                  <SelectItem value="" disabled>Aucune salle disponible</SelectItem>
                )}
                {(["medicalized", "patient_appointment", "operation_room"] as RoomUsage[]).map((u) => {
                  const group = bookableRooms.filter((r) => r.usage === u);
                  if (group.length === 0) return null;
                  return (
                    <div key={u}>
                      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {USAGE_META[u].label}
                      </div>
                      {group.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                          {r.specialty && ` — ${r.specialty}`}
                          <span className="ml-1 text-xs text-muted-foreground">
                            (cap. {r.capacity})
                          </span>
                        </SelectItem>
                      ))}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedRoom && meta && (
              <div className={`mt-1 flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${meta.bg}`}>
                <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />
                <span className={meta.color}>{meta.label}</span>
                {selectedRoom.specialty && (
                  <span className="text-muted-foreground">· {selectedRoom.specialty}</span>
                )}
                {!isOpRoom && (
                  <span className="ml-auto text-muted-foreground">Cap. {selectedRoom.capacity}</span>
                )}
              </div>
            )}
          </div>

          {/* ── OPERATION ROOM fields ─────────────────────────────────────── */}
          {isOpRoom && (
            <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3">

              {/* Primary patient (receveur) */}
              <div className="space-y-1">
                <Label>Patient (receveur) *</Label>
                <Select value={opPatientId} onValueChange={setOpPatientId}>
                  <SelectTrigger><SelectValue placeholder="Choisir le patient" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Donor toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setWithDonor((v) => !v); if (withDonor) setDonorId(""); }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    withDonor ? "bg-rose-600" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      withDonor ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm font-medium">
                  Opération avec donneur
                </span>
              </div>

              {/* Donor patient */}
              {withDonor && (
                <div className="space-y-1">
                  <Label>Patient donneur *</Label>
                  <Select value={donorId} onValueChange={setDonorId}>
                    <SelectTrigger><SelectValue placeholder="Choisir le donneur" /></SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {patients
                        .filter((p) => String(p.id) !== opPatientId)
                        .map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Operation type */}
              <div className="space-y-1">
                <Label>Type d'opération</Label>
                <Input
                  value={opType}
                  onChange={(e) => setOpType(e.target.value)}
                  placeholder="Ex : Transplantation rénale, Appendicectomie…"
                />
              </div>

              {/* Staff assignments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Équipe médicale</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addStaffRow}>
                    <Plus className="mr-1 h-3 w-3" /> Ajouter
                  </Button>
                </div>
                {staffRows.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    Aucun membre d'équipe assigné.
                  </p>
                )}
                {staffRows.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select
                      value={row.employee}
                      onValueChange={(v) => updateStaffRow(idx, "employee", v)}
                    >
                      <SelectTrigger className="flex-1 min-w-0">
                        <SelectValue placeholder="Employé" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={String(emp.id)}>
                            {emp.first_name} {emp.last_name}
                            {emp.job_title && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                · {emp.job_title}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={row.role}
                      onValueChange={(v) => updateStaffRow(idx, "role", v)}
                    >
                      <SelectTrigger className="w-[160px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATION_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStaffRow(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── REGULAR ROOM fields ───────────────────────────────────────── */}
          {!isOpRoom && (
            <div className="grid grid-cols-2 gap-3">
              {/* Patient */}
              <div className="col-span-2 space-y-1">
                <Label>Patient *</Label>
                <Select value={patientId} onValueChange={setPatientId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un patient" /></SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Occupants */}
              <div className="space-y-1">
                <Label>Occupants *</Label>
                <Select value={occupants} onValueChange={setOccupants}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: selectedRoom?.capacity ?? 1 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {occupantsLabel(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Companions detail */}
              <div className="space-y-1">
                <Label>Accompagnants (détail)</Label>
                <Input
                  value={companions}
                  onChange={(e) => setCompanions(e.target.value)}
                  placeholder="Ex : épouse, infirmière"
                  disabled={Number(occupants) <= 1}
                />
              </div>

              {/* Reason */}
              <div className="col-span-2 space-y-1">
                <Label>Motif</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex : Post-op, Consultation ophtalmo"
                />
              </div>
            </div>
          )}

          {/* ── Shared fields ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Début *</Label>
              <Input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Fin *</Label>
              <Input
                type="datetime-local"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Statut</Label>
              <Select value={bStatus} onValueChange={(v) => setBStatus(v as BookingStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Confirmée</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                  <SelectItem value="completed">Terminée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isEdit ? "Enregistrer" : "Réserver"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MachineAssignDialog({
  open, onClose, machine, rooms, onSave, isPending,
}: {
  open: boolean;
  onClose: () => void;
  machine: ApiMachine | null;
  rooms: ApiRoom[];
  onSave: (machineId: number, roomId: number | null) => void;
  isPending: boolean;
}) {
  // Allow all active rooms (removed usage restriction)
  const eligibleRooms = rooms.filter((r) => r.status === "active");
  const [roomId, setRoomId] = useState<string>(String(machine?.room ?? ""));

  if (!machine) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Localiser la machine</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Machine : <strong>{machine.name}</strong>
          </p>
          <div className="space-y-1">
            <Label>Salle / Local</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger><SelectValue placeholder="Aucune salle assignée" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Aucune —</SelectItem>
                {eligibleRooms.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                    {r.location && (
                      <span className="ml-1 text-xs text-muted-foreground">({r.location})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Info className="h-3 w-3" />
              Toutes les salles actives sont sélectionnables.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            disabled={isPending}
            onClick={() => onSave(machine.id, roomId ? Number(roomId) : null)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RoomCard                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function RoomCard({
  room, onEdit, onDelete, onBook, onView,
}: {
  room: ApiRoom;
  onEdit: () => void;
  onDelete: () => void;
  onBook: () => void;
  onView: () => void;
}) {
  const meta     = USAGE_META[room.usage];
  const UsageIcon = meta.icon;

  return (
    <Card
      className={`transition-shadow hover:shadow-md ${room.status !== "active" ? "opacity-70" : ""}`}
    >
      <CardContent className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.bg}`}
            >
              <UsageIcon className={`h-4 w-4 ${meta.color}`} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{room.name}</p>
              <p className={`text-[11px] font-medium ${meta.color}`}>{meta.label}</p>
              {room.specialty && (
                <p className="text-[11px] text-muted-foreground">{room.specialty}</p>
              )}
              {room.location && (
                <p className="truncate text-[11px] text-muted-foreground">{room.location}</p>
              )}
            </div>
          </div>
          {roomStatusBadge(room)}
        </div>

        {/* Capacity bar — bookable rooms only */}
        {room.bookings_allowed && (
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> Capacité
              </span>
              <span>
                {room.active_bookings} rés. active{room.active_bookings !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(room.capacity, 10) }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < room.active_bookings
                      ? "bg-blue-500"
                      : room.status === "active"
                      ? "bg-emerald-200"
                      : "bg-muted"
                  }`}
                />
              ))}
              {room.capacity > 10 && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  +{room.capacity - 10}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Max {room.capacity} occupant{room.capacity !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Machine count — all rooms with machines */}
        {room.machines_count > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span>
              {room.machines_count} machine{room.machines_count !== 1 ? "s" : ""} assignée
              {room.machines_count !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 pt-1">
          {room.bookings_allowed && (
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={onBook}
              disabled={room.status !== "active"}
            >
              <CalendarDays className="mr-1 h-3.5 w-3.5" /> Réserver
            </Button>
          )}
          {/* Machine button: stock -> Package, others with machines -> Wrench */}
          {room.usage === "stock" ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={onView}
            >
              <Package className="mr-1 h-3.5 w-3.5" /> Machines
            </Button>
          ) : room.machines_count > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-muted-foreground"
              onClick={onView}
            >
              <Wrench className="mr-1 h-3.5 w-3.5" />
              {room.machines_count} machine{room.machines_count > 1 ? "s" : ""}
            </Button>
          )}
          {/* Eye button for bookings (if bookable) */}
          {room.bookings_allowed && (
            <Button size="sm" variant="outline" onClick={onView} title="Voir les réservations">
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            title="Supprimer"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  BookingRow                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function BookingRow({
  booking, onEdit, onCancel,
}: {
  booking: ApiBooking;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/30">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
        <BedDouble className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{booking.patient_name}</span>
          <Badge
            variant="outline"
            className={`text-[10px] ${BOOKING_STATUS_COLORS[booking.status]}`}
          >
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <strong>{booking.room_name}</strong>
          {" · "}
          <Clock className="mr-0.5 inline h-3 w-3" />
          {fmtDT(booking.start_datetime)} → {fmtDT(booking.end_datetime)}
        </p>
        <p className="text-xs text-muted-foreground">
          <Users className="mr-0.5 inline h-3 w-3" />
          {occupantsLabel(booking.occupants)}
          {booking.notes_companions && ` (${booking.notes_companions})`}
          {booking.reason && ` · ${booking.reason}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {booking.status !== "cancelled" && booking.status !== "completed" && (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              title="Annuler"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RoomDetailDialog                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────────────────────── */
/*  OpBookingRow — compact row for operation bookings in the bookings tab      */
/* ─────────────────────────────────────────────────────────────────────────── */

function OpBookingRow({
  booking, onEdit, onCancel,
}: {
  booking: ApiOperationBooking;
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-rose-100 bg-rose-50/30 p-3 transition-colors hover:bg-rose-50/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
        <Scissors className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{booking.patient_name}</span>
          {booking.with_donor && booking.donor_patient_name && (
            <Badge variant="outline" className="border-rose-200 bg-rose-100 text-[10px] text-rose-700">
              + donneur : {booking.donor_patient_name}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${BOOKING_STATUS_COLORS[booking.status]}`}
          >
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-[10px] text-rose-600">
            🔪 Bloc opératoire
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <strong>{booking.room_name}</strong>
          {" · "}
          <Clock className="mr-0.5 inline h-3 w-3" />
          {fmtDT(booking.start_datetime)} → {fmtDT(booking.end_datetime)}
        </p>
        {booking.operation_type && (
          <p className="text-xs text-muted-foreground">
            {booking.operation_type}
          </p>
        )}
        {booking.staff_assignments.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <Users className="mr-0.5 inline h-3 w-3" />
            {booking.staff_assignments
              .map((s) => `${s.employee_name ?? "—"} (${s.role})`)
              .join(", ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {booking.status !== "cancelled" && booking.status !== "completed" && (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit} title="Modifier">
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onCancel}
              title="Annuler"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  RoomDetailDialog — updated to show both regular and operation bookings     */
/* ─────────────────────────────────────────────────────────────────────────── */

function RoomDetailDialog({
  room, bookings, opBookings, machines, open, onClose,
  onEditBooking, onEditOpBooking, onCancelBooking, onCancelOpBooking, onAssignMachine,
}: {
  room: ApiRoom | null;
  bookings: ApiBooking[];
  opBookings: ApiOperationBooking[];
  machines: ApiMachine[];
  open: boolean;
  onClose: () => void;
  onEditBooking: (b: ApiBooking) => void;
  onEditOpBooking: (b: ApiOperationBooking) => void;
  onCancelBooking: (b: ApiBooking) => void;
  onCancelOpBooking: (b: ApiOperationBooking) => void;
  onAssignMachine: (m: ApiMachine) => void;
}) {
  if (!room) return null;
  const meta = USAGE_META[room.usage];

  const isOpRoom = room.usage === "operation_room";

  // Regular bookings for this room
  const sorted   = [...bookings.filter((b) => b.room === room.id)].sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  );
  const activeB  = sorted.filter((b) => b.status === "confirmed" || b.status === "pending");
  const pastB    = sorted.filter((b) => b.status === "completed" || b.status === "cancelled");

  // Operation bookings for this room
  const sortedOp  = [...opBookings.filter((b) => b.room === room.id)].sort(
    (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  );
  const activeOp  = sortedOp.filter((b) => b.status === "confirmed" || b.status === "pending");
  const pastOp    = sortedOp.filter((b) => b.status === "completed" || b.status === "cancelled");

  const roomMachines = machines.filter((m) => m.room === room.id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className={`h-5 w-5 ${meta.color}`} />
            {room.name}
            <Badge variant="outline" className={`ml-1 border text-[10px] ${meta.bg}`}>
              {meta.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Info strip */}
        <div className="flex flex-wrap gap-4 rounded-lg border p-3 text-sm">
          {room.specialty && (
            <div>
              <p className="text-xs text-muted-foreground">Spécialité</p>
              <p className="font-medium">{room.specialty}</p>
            </div>
          )}
          {room.bookings_allowed && !isOpRoom && (
            <div>
              <p className="text-xs text-muted-foreground">Capacité</p>
              <p className="font-medium">
                {room.capacity} personne{room.capacity > 1 ? "s" : ""}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Statut</p>
            {roomStatusBadge(room)}
          </div>
          {room.location && (
            <div>
              <p className="text-xs text-muted-foreground">Localisation</p>
              <p className="font-medium">{room.location}</p>
            </div>
          )}
        </div>

        {/* Operation room bookings */}
        {isOpRoom && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">
              Opérations programmées ({activeOp.length})
            </p>
            {activeOp.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Aucune opération programmée.
              </p>
            ) : (
              <div className="space-y-2">
                {activeOp.map((b) => (
                  <OpBookingRow
                    key={b.id}
                    booking={b}
                    onEdit={() => onEditOpBooking(b)}
                    onCancel={() => onCancelOpBooking(b)}
                  />
                ))}
              </div>
            )}
            {pastOp.length > 0 && (
              <>
                <p className="text-sm font-semibold text-muted-foreground">
                  Historique ({pastOp.length})
                </p>
                <div className="space-y-2">
                  {pastOp.map((b) => (
                    <OpBookingRow
                      key={b.id}
                      booking={b}
                      onEdit={() => onEditOpBooking(b)}
                      onCancel={() => onCancelOpBooking(b)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Regular bookings section */}
        {!isOpRoom && room.bookings_allowed && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Réservations actives ({activeB.length})</p>
            {activeB.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                Aucune réservation active.
              </p>
            ) : (
              <div className="space-y-2">
                {activeB.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onEdit={() => onEditBooking(b)}
                    onCancel={() => onCancelBooking(b)}
                  />
                ))}
              </div>
            )}
            {pastB.length > 0 && (
              <>
                <p className="text-sm font-semibold text-muted-foreground">
                  Historique ({pastB.length})
                </p>
                <div className="space-y-2">
                  {pastB.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      onEdit={() => onEditBooking(b)}
                      onCancel={() => onCancelBooking(b)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Machines section */}
        {roomMachines.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Machines dans cette salle ({roomMachines.length})</p>
            <div className="space-y-2">
              {roomMachines.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-md border p-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Wrench className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    {m.model && <p className="text-xs text-muted-foreground">{m.model}</p>}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      m.status === "active"
                        ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                        : m.status === "maintenance"
                        ? "border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                        : "border-rose-200 bg-rose-50 text-[10px] text-rose-600"
                    }
                  >
                    {m.status === "active" ? "Active" : m.status === "maintenance" ? "Maintenance" : "Hors service"}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => onAssignMachine(m)} title="Changer de salle">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main page                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

function RoomsPage() {
  const qc = useQueryClient();

  const roomsQ     = useQuery({ queryKey: ["rooms"],           queryFn: fetchRooms,      refetchOnWindowFocus: true });
  const bookingsQ  = useQuery({ queryKey: ["room-bookings"],   queryFn: fetchBookings,   refetchOnWindowFocus: true });
  const opBookingsQ = useQuery({ queryKey: ["op-bookings"],    queryFn: fetchOpBookings, refetchOnWindowFocus: true });
  const patientsQ  = useQuery({ queryKey: ["patients-light"],  queryFn: fetchPatients });
  const machinesQ  = useQuery({ queryKey: ["machines-light"],  queryFn: fetchMachines });
  const employeesQ = useQuery({ queryKey: ["employees-light"], queryFn: fetchEmployees });

  const rooms      = roomsQ.data      ?? [];
  const bookings   = bookingsQ.data   ?? [];
  const opBookings = opBookingsQ.data ?? [];
  const patients   = patientsQ.data   ?? [];
  const machines   = machinesQ.data   ?? [];
  const employees  = employeesQ.data  ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["rooms"] });
    qc.invalidateQueries({ queryKey: ["room-bookings"] });
    qc.invalidateQueries({ queryKey: ["op-bookings"] });
    qc.invalidateQueries({ queryKey: ["machines-light"] });
  };

  /* ── UI state ───────────────────────────────────────────────────────────── */

  const [tab,           setTab]           = useState<"rooms" | "bookings">("rooms");
  const [search,        setSearch]        = useState("");
  const [usageFilter,   setUsageFilter]   = useState<"all" | RoomUsage>("all");
  const [statusFilter,  setStatusFilter]  = useState<"all" | RoomStatus>("all");
  const [bSearch,       setBSearch]       = useState("");
  const [bStatusFilter, setBStatusFilter] = useState<"all" | BookingStatus>("all");

  const [roomFormOpen,    setRoomFormOpen]    = useState(false);
  const [editRoom,        setEditRoom]        = useState<ApiRoom | null>(null);
  const [deleteTarget,    setDeleteTarget]    = useState<ApiRoom | null>(null);

  // Unified booking form — only one open at a time
  const [bookingFormOpen,  setBookingFormOpen]  = useState(false);
  const [editBooking,      setEditBooking]      = useState<ApiBooking | null>(null);
  const [editOpBooking,    setEditOpBooking]    = useState<ApiOperationBooking | null>(null);
  const [preselectedRoom,  setPreselectedRoom]  = useState<number | undefined>();

  const [cancelTarget,    setCancelTarget]    = useState<ApiBooking | null>(null);
  const [cancelOpTarget,  setCancelOpTarget]  = useState<ApiOperationBooking | null>(null);
  const [viewRoom,        setViewRoom]        = useState<ApiRoom | null>(null);
  const [assignMachine,   setAssignMachine]   = useState<ApiMachine | null>(null);

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  const createRoomMut = useMutation({
    mutationFn: createRoom,
    onSuccess: () => { invalidate(); setRoomFormOpen(false); toast.success("Salle créée"); },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur création salle"),
  });

  const updateRoomMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ApiRoom> }) => updateRoom(id, data),
    onSuccess: () => {
      invalidate(); setRoomFormOpen(false); setEditRoom(null);
      toast.success("Salle mise à jour");
    },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur mise à jour"),
  });

  const deleteRoomMut = useMutation({
    mutationFn: (id: number) => deleteRoom(id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast.success("Salle supprimée"); },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur suppression"),
  });

  // Regular booking mutations
  const createBookingMut = useMutation({
    mutationFn: createBooking,
    onSuccess: (data) => {
      invalidate();
      setBookingFormOpen(false);
      setPreselectedRoom(undefined);
      if (data.conflict_warning) toast.warning(data.conflict_warning);
      else toast.success("Réservation créée");
    },
    onError: (e: any) => toast.error(e?.data?.detail || e?.message || "Erreur réservation"),
  });

  const updateBookingMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ApiBooking> }) =>
      updateBooking(id, data),
    onSuccess: () => {
      invalidate(); setBookingFormOpen(false); setEditBooking(null);
      toast.success("Réservation mise à jour");
    },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur mise à jour"),
  });

  const cancelBookingMut = useMutation({
    mutationFn: (id: number) => updateBooking(id, { status: "cancelled" }),
    onSuccess: () => { invalidate(); setCancelTarget(null); toast.success("Réservation annulée"); },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur annulation"),
  });

  // Operation booking mutations
  const createOpBookingMut = useMutation({
    mutationFn: createOpBooking,
    onSuccess: (data) => {
      invalidate();
      setBookingFormOpen(false);
      setPreselectedRoom(undefined);
      if (data.conflict_warning) toast.warning(data.conflict_warning);
      else toast.success("Réservation de bloc créée");
    },
    onError: (e: any) => toast.error(e?.data?.detail || e?.message || "Erreur réservation bloc"),
  });

  const updateOpBookingMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<OpBookingPayload> }) =>
      updateOpBooking(id, data),
    onSuccess: () => {
      invalidate(); setBookingFormOpen(false); setEditOpBooking(null);
      toast.success("Réservation de bloc mise à jour");
    },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur mise à jour bloc"),
  });

  const cancelOpBookingMut = useMutation({
    mutationFn: (id: number) => updateOpBooking(id, { status: "cancelled" }),
    onSuccess: () => { invalidate(); setCancelOpTarget(null); toast.success("Réservation annulée"); },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur annulation"),
  });

  const assignMachineMut = useMutation({
    mutationFn: ({ machineId, roomId }: { machineId: number; roomId: number | null }) =>
      assignMachineRoom(machineId, roomId),
    onSuccess: () => { invalidate(); setAssignMachine(null); toast.success("Machine localisée"); },
    onError: (e: any) => toast.error(e?.data?.detail || "Erreur assignation"),
  });

  /* ── Filtered data ──────────────────────────────────────────────────────── */

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      if (usageFilter !== "all" && r.usage !== usageFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !r.location.toLowerCase().includes(q) &&
        !r.specialty.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rooms, search, usageFilter, statusFilter]);

  // Combine regular + operation bookings for the bookings tab
  const allBookingsForTab = useMemo(() => {
    const q = bSearch.trim().toLowerCase();

    type UnifiedBooking =
      | { kind: "regular"; data: ApiBooking }
      | { kind: "operation"; data: ApiOperationBooking };

    const regular: UnifiedBooking[] = bookings
      .filter((b) => {
        if (bStatusFilter !== "all" && b.status !== bStatusFilter) return false;
        if (q && !b.patient_name.toLowerCase().includes(q) && !b.room_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((b) => ({ kind: "regular" as const, data: b }));

    const ops: UnifiedBooking[] = opBookings
      .filter((b) => {
        if (bStatusFilter !== "all" && b.status !== bStatusFilter) return false;
        if (q && !b.patient_name.toLowerCase().includes(q) && !b.room_name.toLowerCase().includes(q)) return false;
        return true;
      })
      .map((b) => ({ kind: "operation" as const, data: b }));

    return [...regular, ...ops].sort(
      (a, b) =>
        new Date(a.data.start_datetime).getTime() - new Date(b.data.start_datetime).getTime()
    );
  }, [bookings, opBookings, bSearch, bStatusFilter]);

  /* ── Stats ──────────────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const medicalized = rooms.filter((r) => r.usage === "medicalized").length;
    const appointment = rooms.filter((r) => r.usage === "patient_appointment").length;
    const operations  = rooms.filter((r) => r.usage === "operation_room").length;
    const stock       = rooms.filter((r) => r.usage === "stock").length;
    const occupied    = rooms.filter(
      (r) => r.active_bookings > 0 && r.bookings_allowed && r.status === "active"
    ).length;
    const todayBookings =
      bookings.filter((b) => {
        if (b.status === "cancelled") return false;
        return new Date(b.start_datetime).toDateString() === new Date().toDateString();
      }).length +
      opBookings.filter((b) => {
        if (b.status === "cancelled") return false;
        return new Date(b.start_datetime).toDateString() === new Date().toDateString();
      }).length;
    return { medicalized, appointment, operations, stock, occupied, todayBookings };
  }, [rooms, bookings, opBookings]);

  const isLoading = roomsQ.isLoading || bookingsQ.isLoading || opBookingsQ.isLoading;

  /* ── Helpers to open booking form ───────────────────────────────────────── */
  function openNewBooking(roomId?: number) {
    setEditBooking(null);
    setEditOpBooking(null);
    setPreselectedRoom(roomId);
    setBookingFormOpen(true);
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <AppShell
      title="Salles"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditRoom(null); setRoomFormOpen(true); }}
          >
            <DoorOpen className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Nouvelle salle</span>
          </Button>
          <Button size="sm" onClick={() => openNewBooking()}>
            <Plus className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Réserver</span>
          </Button>
        </div>
      }
    >
      {/* ── Dialogs ────────────────────────────────────────────────────────── */}

      {roomFormOpen && (
        <RoomFormDialog
          open={roomFormOpen}
          onClose={() => { setRoomFormOpen(false); setEditRoom(null); }}
          initial={editRoom ?? undefined}
          onSave={(data) => {
            if (editRoom) updateRoomMut.mutate({ id: editRoom.id, data });
            else createRoomMut.mutate(data);
          }}
          isPending={createRoomMut.isPending || updateRoomMut.isPending}
        />
      )}

      {bookingFormOpen && (
        <BookingFormDialog
          open={bookingFormOpen}
          onClose={() => {
            setBookingFormOpen(false);
            setEditBooking(null);
            setEditOpBooking(null);
            setPreselectedRoom(undefined);
          }}
          rooms={rooms}
          patients={patients}
          employees={employees}
          initialBooking={editBooking ?? undefined}
          initialOpBooking={editOpBooking ?? undefined}
          preselectedRoomId={preselectedRoom}
          onSaveBooking={(data) => {
            if (editBooking) updateBookingMut.mutate({ id: editBooking.id, data });
            else createBookingMut.mutate(data);
          }}
          onSaveOpBooking={(data) => {
            if (editOpBooking) updateOpBookingMut.mutate({ id: editOpBooking.id, data });
            else createOpBookingMut.mutate(data);
          }}
          isPending={
            createBookingMut.isPending ||
            updateBookingMut.isPending ||
            createOpBookingMut.isPending ||
            updateOpBookingMut.isPending
          }
        />
      )}

      <RoomDetailDialog
        room={viewRoom}
        bookings={bookings}
        opBookings={opBookings}
        machines={machines}
        open={viewRoom !== null}
        onClose={() => setViewRoom(null)}
        onEditBooking={(b) => {
          setEditBooking(b);
          setEditOpBooking(null);
          setPreselectedRoom(undefined);
          setBookingFormOpen(true);
        }}
        onEditOpBooking={(b) => {
          setEditOpBooking(b);
          setEditBooking(null);
          setPreselectedRoom(undefined);
          setBookingFormOpen(true);
        }}
        onCancelBooking={(b) => setCancelTarget(b)}
        onCancelOpBooking={(b) => setCancelOpTarget(b)}
        onAssignMachine={(m) => setAssignMachine(m)}
      />

      <MachineAssignDialog
        open={assignMachine !== null}
        onClose={() => setAssignMachine(null)}
        machine={assignMachine}
        rooms={rooms}
        onSave={(machineId, roomId) => assignMachineMut.mutate({ machineId, roomId })}
        isPending={assignMachineMut.isPending}
      />

      {/* Delete room confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Supprimer la salle ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            La salle <strong>{deleteTarget?.name}</strong> et toutes ses réservations seront
            supprimées définitivement.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={deleteRoomMut.isPending}
              onClick={() => { if (deleteTarget) deleteRoomMut.mutate(deleteTarget.id); }}
            >
              {deleteRoomMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel regular booking confirm */}
      <Dialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Annuler la réservation ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            La réservation de <strong>{cancelTarget?.patient_name}</strong> dans{" "}
            <strong>{cancelTarget?.room_name}</strong> sera marquée comme annulée.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Non</Button>
            <Button
              variant="destructive"
              disabled={cancelBookingMut.isPending}
              onClick={() => { if (cancelTarget) cancelBookingMut.mutate(cancelTarget.id); }}
            >
              {cancelBookingMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Annuler la réservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel operation booking confirm */}
      <Dialog open={cancelOpTarget !== null} onOpenChange={(o) => !o && setCancelOpTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Annuler l'opération ?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            L'opération de <strong>{cancelOpTarget?.patient_name}</strong> dans{" "}
            <strong>{cancelOpTarget?.room_name}</strong> sera marquée comme annulée.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpTarget(null)}>Non</Button>
            <Button
              variant="destructive"
              disabled={cancelOpBookingMut.isPending}
              onClick={() => { if (cancelOpTarget) cancelOpBookingMut.mutate(cancelOpTarget.id); }}
            >
              {cancelOpBookingMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Annuler l'opération
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main content ───────────────────────────────────────────────────── */}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="space-y-4">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: "Médicalisées",      value: stats.medicalized,   Icon: BedDouble,    color: "bg-violet-100 text-violet-600" },
              { label: "Salles de rdv",     value: stats.appointment,   Icon: Stethoscope,  color: "bg-blue-100 text-blue-600" },
              { label: "Blocs opératoires", value: stats.operations,    Icon: Scissors,     color: "bg-rose-100 text-rose-600" },
              { label: "Stocks / locaux",   value: stats.stock,         Icon: Package,      color: "bg-amber-100 text-amber-600" },
              { label: "Occupées",          value: stats.occupied,      Icon: Users,        color: "bg-emerald-100 text-emerald-600" },
              { label: "Réservations auj.", value: stats.todayBookings, Icon: CalendarDays, color: "bg-rose-100 text-rose-600" },
            ].map(({ label, value, Icon, color }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold leading-tight">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex border-b">
            {(["rooms", "bookings"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "rooms"
                  ? `Salles (${rooms.length})`
                  : `Réservations (${
                      bookings.filter((b) => b.status !== "cancelled").length +
                      opBookings.filter((b) => b.status !== "cancelled").length
                    })`}
              </button>
            ))}
          </div>

          {/* ── Rooms tab ─────────────────────────────────────────────────── */}
          {tab === "rooms" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, localisation, spécialité…"
                    className="pl-9"
                  />
                  {search && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setSearch("")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select
                  value={usageFilter}
                  onValueChange={(v) => setUsageFilter(v as "all" | RoomUsage)}
                >
                  <SelectTrigger className="w-[190px]">
                    <SelectValue placeholder="Type d'usage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les types</SelectItem>
                    <SelectItem value="medicalized">🛏 Chambre médicalisée</SelectItem>
                    <SelectItem value="operation_room">🔪 Salle d'opération</SelectItem>
                    <SelectItem value="patient_appointment">🩺 Salle de rendez-vous</SelectItem>
                    <SelectItem value="stock">📦 Stock / Local</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as "all" | RoomStatus)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="closed">Fermée</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Aucune salle trouvée.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredRooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      onEdit={() => { setEditRoom(room); setRoomFormOpen(true); }}
                      onDelete={() => setDeleteTarget(room)}
                      onBook={() => openNewBooking(room.id)}
                      onView={() => setViewRoom(room)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Bookings tab ──────────────────────────────────────────────── */}
          {tab === "bookings" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={bSearch}
                    onChange={(e) => setBSearch(e.target.value)}
                    placeholder="Patient, salle…"
                    className="pl-9"
                  />
                  {bSearch && (
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setBSearch("")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Select
                  value={bStatusFilter}
                  onValueChange={(v) => setBStatusFilter(v as "all" | BookingStatus)}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous statuts</SelectItem>
                    <SelectItem value="confirmed">Confirmée</SelectItem>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="completed">Terminée</SelectItem>
                    <SelectItem value="cancelled">Annulée</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {allBookingsForTab.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  Aucune réservation trouvée.
                </div>
              ) : (
                <div className="space-y-2">
                  {allBookingsForTab.map((item) =>
                    item.kind === "regular" ? (
                      <BookingRow
                        key={`r-${item.data.id}`}
                        booking={item.data}
                        onEdit={() => {
                          setEditBooking(item.data);
                          setEditOpBooking(null);
                          setPreselectedRoom(undefined);
                          setBookingFormOpen(true);
                        }}
                        onCancel={() => setCancelTarget(item.data)}
                      />
                    ) : (
                      <OpBookingRow
                        key={`op-${item.data.id}`}
                        booking={item.data}
                        onEdit={() => {
                          setEditOpBooking(item.data);
                          setEditBooking(null);
                          setPreselectedRoom(undefined);
                          setBookingFormOpen(true);
                        }}
                        onCancel={() => setCancelOpTarget(item.data)}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </AppShell>
  );
}