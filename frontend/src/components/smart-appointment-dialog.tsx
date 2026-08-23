import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Clock, Star, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import {
  smartSuggest,
  smartBook,
  TYPE_LABELS,
  PRIORITY_LABELS,
  type AppointmentType,
  type AppointmentPriority,
  type SlotSuggestion,
} from "@/lib/smart-appointments-api";

// ─── Types props ──────────────────────────────────────────────────────────────

interface SmartAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: { id: number; first_name: string; last_name: string }[];
  doctors:  { id: number; first_name: string; last_name: string }[];
  rooms?:   { id: number; name: string }[];
  onBooked?: (appointmentId: number) => void;
}

// ─── Step type ────────────────────────────────────────────────────────────────
type Step = "form" | "suggestions" | "booked";

// ─── Composant principal ──────────────────────────────────────────────────────

export function SmartAppointmentDialog({
  open,
  onOpenChange,
  patients,
  doctors,
  rooms = [],
  onBooked,
}: SmartAppointmentDialogProps) {
  const [step, setStep] = useState<Step>("form");

  // Form state
  const [patientId,       setPatientId]       = useState<number | null>(null);
  const [doctorId,        setDoctorId]        = useState<number | null>(null);
  const [aptType,         setAptType]         = useState<AppointmentType>("simple");
  const [priority,        setPriority]        = useState<AppointmentPriority>(2);
  const [reason,          setReason]          = useState("");
  const [roomId,          setRoomId]          = useState<number | null>(null);

  // Suggestions state
  const [suggestions,     setSuggestions]     = useState<SlotSuggestion[]>([]);
  const [selected,        setSelected]        = useState<SlotSuggestion | null>(null);
  const [loading,         setLoading]         = useState(false);
  const [booking,         setBooking]         = useState(false);
  const [bookedId,        setBookedId]        = useState<number | null>(null);
  const [error,           setError]           = useState("");

  function reset() {
    setStep("form");
    setPatientId(null);
    setDoctorId(null);
    setAptType("simple");
    setPriority(2);
    setReason("");
    setRoomId(null);
    setSuggestions([]);
    setSelected(null);
    setBookedId(null);
    setError("");
  }

  // ── Step 1 : demande de suggestions ───────────────────────────────────────
  async function handleGetSuggestions() {
    if (!patientId || !doctorId) {
      setError("Veuillez sélectionner un patient et un médecin.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await smartSuggest({
        patient_id: patientId,
        doctor_id:  doctorId,
        appointment_type: aptType,
        priority,
      });
      setSuggestions(res.suggestions);
      setStep("suggestions");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de la recherche de créneaux.");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2 : confirmation de réservation ──────────────────────────────────
  async function handleBook() {
    if (!selected || !patientId || !doctorId) return;
    setBooking(true);
    setError("");
    try {
      const res = await smartBook({
        patient_id:       patientId,
        doctor_id:        doctorId,
        slot_datetime:    selected.datetime,
        appointment_type: aptType,
        priority,
        room_id:          roomId ?? undefined,
        reason,
      });
      setBookedId(res.appointment_id);
      setStep("booked");
      onBooked?.(res.appointment_id);
      toast.success("Rendez-vous planifié — en attente de confirmation patient.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de la réservation.");
    } finally {
      setBooking(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const suggestTypeIcons = {
    closest:    { icon: Clock,   label: "Le plus proche",              color: "text-blue-600",   bg: "bg-blue-50"   },
    best_match: { icon: Star,    label: "Meilleur pour le patient",    color: "text-amber-600",  bg: "bg-amber-50"  },
    flexible:   { icon: Calendar,label: "Le plus flexible",            color: "text-emerald-600",bg: "bg-emerald-50"},
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Planification intelligente
          </DialogTitle>
        </DialogHeader>

        {/* ── Stepper indicator ── */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          {(["form","suggestions","booked"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold
                ${step === s ? "bg-primary text-white" : step > s || (step === "booked" && s !== "booked") ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                {i + 1}
              </span>
              <span className={step === s ? "text-gray-700 font-medium" : ""}>
                {["Paramètres", "Créneaux", "Confirmé"][i]}
              </span>
              {i < 2 && <span>›</span>}
            </span>
          ))}
        </div>

        {/* ══ STEP 1 : FORM ══ */}
        {step === "form" && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Patient *</Label>
              <Select onValueChange={(v) => setPatientId(Number(v))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner un patient..." />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Médecin *</Label>
              <Select onValueChange={(v) => setDoctorId(Number(v))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sélectionner un médecin..." />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      Dr. {d.first_name} {d.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type de RDV</Label>
                <Select value={aptType} onValueChange={(v) => setAptType(v as AppointmentType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TYPE_LABELS) as [AppointmentType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priorité</Label>
                <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v) as AppointmentPriority)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rooms.length > 0 && (
              <div>
                <Label className="text-xs">Salle (optionnel)</Label>
                <Select onValueChange={(v) => setRoomId(v ? Number(v) : null)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Salle automatique" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Automatique</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Motif</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif du rendez-vous..."
                className="mt-1"
              />
            </div>

            {priority === 1 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Urgence : le RDV peut être planifié aujourd'hui (J+0).
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button onClick={handleGetSuggestions} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recherche...</> : <><Sparkles className="h-4 w-4 mr-2" />Trouver des créneaux</>}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ══ STEP 2 : SUGGESTIONS ══ */}
        {step === "suggestions" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              {suggestions.length} créneau{suggestions.length > 1 ? "x" : ""} proposé{suggestions.length > 1 ? "s" : ""}. Sélectionnez celui qui convient.
            </p>

            <div className="space-y-2">
              {suggestions.map((s) => {
                const meta = suggestTypeIcons[s.type];
                const Icon = meta.icon;
                const dt = new Date(s.datetime);
                const isSelected = selected?.datetime === s.datetime && selected?.type === s.type;
                return (
                  <button
                    key={`${s.type}-${s.datetime}`}
                    type="button"
                    onClick={() => setSelected(s)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all
                      ${isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <div className={`h-10 w-10 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">
                          {dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                        <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        &nbsp;·&nbsp;{s.duration_minutes} min
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-gray-800">{s.score}</p>
                      <p className="text-[10px] text-gray-400">/10</p>
                    </div>
                    {isSelected && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")}>← Retour</Button>
              <Button onClick={handleBook} disabled={!selected || booking}>
                {booking
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Réservation...</>
                  : "Confirmer le créneau"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ══ STEP 3 : BOOKED ══ */}
        {step === "booked" && selected && (
          <div className="text-center py-4 space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mx-auto">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Rendez-vous planifié !</h3>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(selected.datetime).toLocaleDateString("fr-FR", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
                {" à "}
                {new Date(selected.datetime).toLocaleTimeString("fr-FR", {
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              ⏳ En attente de confirmation patient (48h). Un lien de confirmation a été envoyé.
            </div>
            <DialogFooter className="sm:justify-center gap-2">
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Fermer</Button>
              <Button onClick={() => { reset(); }}>Nouveau RDV</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}