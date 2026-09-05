import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Search,
  AlertCircle,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Trash2,
  MapPin,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/equipment")({
  component: EquipmentPage,
});

// ── Types ──────────────────────────────────────────────────────────────────────

type MachineStatus = "active" | "maintenance" | "decommissioned";
type RoomUsage = "medicalized" | "patient_appointment" | "stock";

interface Room {
  id: number;
  name: string;
  usage: RoomUsage;
  location: string;
  status: string;
}

interface Machine {
  id: number;
  name: string;
  model: string;
  serial_number: string;
  manufacturer: string;
  status: MachineStatus;
  room: number | null;
  room_name: string | null;
  location: string;
  purchase_date: string | null;
  purchase_cost: string | null;
  useful_life_years: number;
  residual_value: string;
  last_calibration_date: string | null;
  next_calibration_date: string | null;
  calibration_interval_days: number;
  mtbf_hours: number;
  mttr_hours: number;
  notes: string;
  created_at: string;
  updated_at: string;
  disponibilite: number | null;
  annual_depreciation: string | null;
  book_value: string | null;
  calibration_overdue: boolean;
  maintenance_logs: MaintenanceLog[];
}

type InterventionType = "preventive" | "corrective" | "calibration" | "inspection";
type InterventionResult = "ok" | "repaired" | "partial" | "failed";

interface MaintenanceLog {
  id: number;
  machine: number;
  intervention_type: InterventionType;
  start_datetime: string;
  end_datetime: string | null;
  technician: string;
  description: string;
  result: InterventionResult | "";
  cost: string | null;
  next_service_date: string | null;
  notes: string;
  duration_hours: number | null;
  created_at: string;
}

type Paginated<T> = { results: T[]; count: number } | T[];

function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}

// ── API helpers ────────────────────────────────────────────────────────────────

const fetchMachines = async () => {
  const data = await apiFetch<Paginated<Machine>>("/crm/machines/?expand=maintenance_logs");
  return unwrap(data);
};

const fetchRooms = async (): Promise<Room[]> => {
  const data = await apiFetch<Paginated<Room>>("/crm/rooms/?page_size=200");
  return unwrap(data);
};

const createMachine = (data: Partial<Machine>) =>
  apiFetch<Machine>("/crm/machines/", { method: "POST", body: data });

const updateMachine = ({ id, ...data }: Partial<Machine> & { id: number }) =>
  apiFetch<Machine>(`/crm/machines/${id}/`, { method: "PATCH", body: data });

const deleteMachine = (id: number) =>
  apiFetch(`/crm/machines/${id}/`, { method: "DELETE" });

const updateMachineRoom = (id: number, roomId: number | null) =>
  apiFetch<Machine>(`/crm/machines/${id}/`, { method: "PATCH", body: { room: roomId } });

const createLog = (data: Partial<MaintenanceLog>) =>
  apiFetch<MaintenanceLog>("/crm/maintenance-logs/", { method: "POST", body: data });

const deleteLog = (id: number) =>
  apiFetch(`/crm/maintenance-logs/${id}/`, { method: "DELETE" });

// ── Helpers ────────────────────────────────────────────────────────────────────

function statusBadge(status: MachineStatus) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>;
  if (status === "maintenance") return <Badge className="bg-amber-100 text-amber-700 border-0">Maintenance</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-0">Hors service</Badge>;
}

function interventionLabel(t: InterventionType) {
  const map: Record<InterventionType, string> = {
    preventive: "Préventive",
    corrective: "Corrective",
    calibration: "Calibration",
    inspection: "Inspection",
  };
  return map[t] ?? t;
}

function resultBadge(r: InterventionResult | "") {
  if (!r) return null;
  const colors: Record<InterventionResult, string> = {
    ok: "bg-green-100 text-green-700 border-0",
    repaired: "bg-blue-100 text-blue-700 border-0",
    partial: "bg-amber-100 text-amber-700 border-0",
    failed: "bg-red-100 text-red-700 border-0",
  };
  const labels: Record<InterventionResult, string> = {
    ok: "OK",
    repaired: "Réparé",
    partial: "Partiel",
    failed: "Échec",
  };
  return <Badge className={colors[r]}>{labels[r]}</Badge>;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

function fmtTND(v: string | null | number) {
  if (v == null) return "—";
  return Number(v).toLocaleString("fr-FR", { minimumFractionDigits: 2 }) + " TND";
}

// ── Main page ──────────────────────────────────────────────────────────────────

function EquipmentPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openCreate, setOpenCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [openLog, setOpenLog] = useState<number | null>(null); // machine id for log dialog

  // ── Machines query
  const machinesQuery = useQuery({ queryKey: ["machines"], queryFn: fetchMachines });
  const machines = machinesQuery.data ?? [];

  // ── Rooms query (for assignment — only stock + medicalized)
  const roomsQuery = useQuery({ queryKey: ["rooms-for-machines"], queryFn: fetchRooms });
  const assignableRooms = (roomsQuery.data ?? []).filter(
    (r) => (r.usage === "stock" || r.usage === "medicalized") && r.status === "active"
  );

  // ── Filtered machines
  const filtered = useMemo(() => {
    return machines.filter((m) => {
      const matchQ =
        !query ||
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.manufacturer.toLowerCase().includes(query.toLowerCase()) ||
        m.model.toLowerCase().includes(query.toLowerCase());
      const matchS = statusFilter === "all" || m.status === statusFilter;
      return matchQ && matchS;
    });
  }, [machines, query, statusFilter]);

  // ── Summary counters
  const totalActive = machines.filter((m) => m.status === "active").length;
  const totalMaint = machines.filter((m) => m.status === "maintenance").length;
  const overdue = machines.filter((m) => m.calibration_overdue).length;

  // ── Mutations
  const createMutation = useMutation({
    mutationFn: createMachine,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["machines"] }); setOpenCreate(false); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteMachine,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });
  const updateMutation = useMutation({
    mutationFn: updateMachine,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });
  const createLogMutation = useMutation({
    mutationFn: createLog,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["machines"] }); setOpenLog(null); },
  });
  const deleteLogMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({ id, roomId }: { id: number; roomId: number | null }) =>
      updateMachineRoom(id, roomId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["machines"] }),
  });

  // ── Create machine form submit
  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string | number | null> = {};
    for (const [k, v] of fd.entries()) {
      data[k] = (v as string).trim() === "" ? null : v as string;
    }
    createMutation.mutate(data as Partial<Machine>);
  }

  // ── Create log form submit
  function handleCreateLog(machineId: number, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string | number | null> = { machine: machineId };
    for (const [k, v] of fd.entries()) {
      data[k] = (v as string).trim() === "" ? null : v as string;
    }
    createLogMutation.mutate(data as Partial<MaintenanceLog>);
  }

  return (
    <AppShell title="Équipements & Maintenance">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Machines totales</p>
            <p className="text-2xl font-bold">{machines.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Actives</p>
            <p className="text-2xl font-bold text-green-600">{totalActive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">En maintenance</p>
            <p className="text-2xl font-bold text-amber-600">{totalMaint}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-start gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Calibration dépassée</p>
              <p className="text-2xl font-bold text-red-600">{overdue}</p>
            </div>
            {overdue > 0 && <AlertCircle className="h-5 w-5 text-red-500 mt-1" />}
          </CardContent>
        </Card>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="decommissioned">Hors service</SelectItem>
          </SelectContent>
        </Select>

        {/* Create machine dialog */}
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nouvelle machine</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nouvelle machine</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nom *</Label>
                  <Input name="name" required />
                </div>
                <div>
                  <Label>Fabricant</Label>
                  <Input name="manufacturer" />
                </div>
                <div>
                  <Label>Modèle</Label>
                  <Input name="model" />
                </div>
                <div>
                  <Label>N° série</Label>
                  <Input name="serial_number" />
                </div>
                <div>
                  <Label>Salle / Local</Label>
                  <select name="room" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="">— Aucune —</option>
                    {assignableRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.location ? ` (${r.location})` : ""}
                        {r.usage === "stock" ? " 📦" : " 🛏️"}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Stock / Chambres médicalisées uniquement</p>
                </div>
                <div>
                  <Label>Emplacement (complément)</Label>
                  <Input name="location" placeholder="Étage, couloir…" />
                </div>
                <div>
                  <Label>Statut</Label>
                  <select name="status" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="active">Active</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="decommissioned">Hors service</option>
                  </select>
                </div>
                <div>
                  <Label>Date d'achat</Label>
                  <Input name="purchase_date" type="date" />
                </div>
                <div>
                  <Label>Coût d'achat (TND)</Label>
                  <Input name="purchase_cost" type="number" step="0.01" />
                </div>
                <div>
                  <Label>Durée d'amortissement (ans)</Label>
                  <Input name="useful_life_years" type="number" defaultValue={10} />
                </div>
                <div>
                  <Label>Valeur résiduelle (TND)</Label>
                  <Input name="residual_value" type="number" step="0.01" defaultValue={0} />
                </div>
                <div>
                  <Label>Dernière calibration</Label>
                  <Input name="last_calibration_date" type="date" />
                </div>
                <div>
                  <Label>Prochaine calibration</Label>
                  <Input name="next_calibration_date" type="date" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea name="notes" rows={2} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Créer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Machines table ── */}
      {machinesQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Salle</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Disponibilité</TableHead>
                <TableHead>MTBF</TableHead>
                <TableHead>MTTR</TableHead>
                <TableHead>Calibration</TableHead>
                <TableHead>Valeur nette</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Aucune machine trouvée
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((m) => (
                <>
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                    <TableCell>
                      {expandedId === m.id
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.manufacturer} {m.model}</div>
                      {m.location && <div className="text-xs text-muted-foreground">{m.location}</div>}
                    </TableCell>
                    <TableCell>
                      {m.room_name ? (
                        <span className="flex items-center gap-1 text-xs font-medium">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          {m.room_name}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell>
                      {m.disponibilite != null
                        ? <span className={m.disponibilite >= 95 ? "text-green-600 font-medium" : m.disponibilite >= 80 ? "text-amber-600 font-medium" : "text-red-600 font-medium"}>
                            {m.disponibilite}%
                          </span>
                        : "—"}
                    </TableCell>
                    <TableCell>{m.mtbf_hours > 0 ? `${m.mtbf_hours}h` : "—"}</TableCell>
                    <TableCell>{m.mttr_hours > 0 ? `${m.mttr_hours}h` : "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {m.calibration_overdue && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        <span className={m.calibration_overdue ? "text-red-600 text-xs" : "text-xs"}>
                          {fmtDate(m.next_calibration_date)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{fmtTND(m.book_value)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Status toggle */}
                        <Select
                          value={m.status}
                          onValueChange={(v) => updateMutation.mutate({ id: m.id, status: v as MachineStatus })}
                        >
                          <SelectTrigger className="h-7 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="decommissioned">Hors service</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500"
                          onClick={() => { if (confirm("Supprimer cette machine ?")) deleteMutation.mutate(m.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* ── Expanded: lifecycle + maintenance logs ── */}
                  {expandedId === m.id && (
                    <TableRow key={`${m.id}-expanded`}>
                      <TableCell colSpan={10} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* ── Amortissement ── */}
                          <Card>
                            <CardHeader className="py-3 px-4">
                              <CardTitle className="text-sm">Amortissement & Cycle de vie</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4 text-sm space-y-1">
                              <div className="flex justify-between"><span className="text-muted-foreground">Coût d'achat</span><span>{fmtTND(m.purchase_cost)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Date d'achat</span><span>{fmtDate(m.purchase_date)}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Durée amortissement</span><span>{m.useful_life_years} ans</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Valeur résiduelle</span><span>{fmtTND(m.residual_value)}</span></div>
                              <div className="flex justify-between font-medium"><span>Amortissement annuel</span><span>{fmtTND(m.annual_depreciation)}</span></div>
                              <div className="flex justify-between font-medium text-blue-700"><span>Valeur nette comptable</span><span>{fmtTND(m.book_value)}</span></div>
                            </CardContent>
                          </Card>

                          {/* ── Calibration ── */}
                          <Card>
                            <CardHeader className="py-3 px-4">
                              <CardTitle className="text-sm">Calibration</CardTitle>
                            </CardHeader>
                            <CardContent className="px-4 pb-4 text-sm space-y-1">
                              <div className="flex justify-between"><span className="text-muted-foreground">Dernière</span><span>{fmtDate(m.last_calibration_date)}</span></div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Prochaine</span>
                                <span className={m.calibration_overdue ? "text-red-600 font-medium flex items-center gap-1" : ""}>
                                  {m.calibration_overdue && <AlertCircle className="h-3.5 w-3.5" />}
                                  {fmtDate(m.next_calibration_date)}
                                </span>
                              </div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Intervalle</span><span>{m.calibration_interval_days} jours</span></div>
                              {m.disponibilite != null && (
                                <div className="flex justify-between font-medium mt-2">
                                  <span>Disponibilité</span>
                                  <span className={m.disponibilite >= 95 ? "text-green-600" : m.disponibilite >= 80 ? "text-amber-600" : "text-red-600"}>
                                    {m.disponibilite}%
                                  </span>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>

                        {/* ── Salle / Localisation ── */}
                        <Card>
                          <CardHeader className="py-3 px-4">
                            <CardTitle className="text-sm flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" /> Salle & Localisation
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-4 text-sm space-y-3">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-medium">Salle assignée</label>
                              <Select
                                value={m.room != null ? String(m.room) : ""}
                                onValueChange={(v) =>
                                  updateRoomMutation.mutate({ id: m.id, roomId: v ? Number(v) : null })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="— Aucune —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">— Aucune —</SelectItem>
                                  {assignableRooms.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>
                                      {r.usage === "stock" ? "📦" : "🛏️" } {r.name}
                                      {r.location ? ` · ${r.location}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[11px] text-muted-foreground">
                                Seuls les locaux stock et chambres médicalisées sont sélectionnables.
                              </p>
                            </div>
                            {m.location && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Complément</span>
                                <span>{m.location}</span>
                              </div>
                            )}
                            {updateRoomMutation.isPending && (
                              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
                              </p>
                            )}
                          </CardContent>
                        </Card>

                        {/* ── Maintenance logs ── */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold flex items-center gap-1.5">
                              <ClipboardList className="h-4 w-4" />
                              Journal de maintenance ({(m.maintenance_logs ?? []).length})
                            </h4>
                            {/* Add log dialog */}
                            <Dialog open={openLog === m.id} onOpenChange={(o) => setOpenLog(o ? m.id : null)}>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter intervention
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader><DialogTitle>Nouvelle intervention — {m.name}</DialogTitle></DialogHeader>
                                <form onSubmit={(e) => handleCreateLog(m.id, e)} className="space-y-3 mt-2">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label>Type *</Label>
                                      <select name="intervention_type" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                                        <option value="preventive">Préventive</option>
                                        <option value="corrective">Corrective</option>
                                        <option value="calibration">Calibration</option>
                                        <option value="inspection">Inspection</option>
                                      </select>
                                    </div>
                                    <div>
                                      <Label>Résultat</Label>
                                      <select name="result" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                                        <option value="">—</option>
                                        <option value="ok">OK</option>
                                        <option value="repaired">Réparé</option>
                                        <option value="partial">Partiel</option>
                                        <option value="failed">Échec</option>
                                      </select>
                                    </div>
                                    <div>
                                      <Label>Début *</Label>
                                      <Input name="start_datetime" type="datetime-local" required />
                                    </div>
                                    <div>
                                      <Label>Fin</Label>
                                      <Input name="end_datetime" type="datetime-local" />
                                    </div>
                                    <div>
                                      <Label>Technicien</Label>
                                      <Input name="technician" />
                                    </div>
                                    <div>
                                      <Label>Coût (TND)</Label>
                                      <Input name="cost" type="number" step="0.01" />
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Description</Label>
                                    <Textarea name="description" rows={2} />
                                  </div>
                                  <DialogFooter>
                                    <Button type="submit" disabled={createLogMutation.isPending}>
                                      {createLogMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                                      Enregistrer
                                    </Button>
                                  </DialogFooter>
                                </form>
                              </DialogContent>
                            </Dialog>
                          </div>

                          {(m.maintenance_logs ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">Aucune intervention enregistrée.</p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Technicien</TableHead>
                                  <TableHead>Durée</TableHead>
                                  <TableHead>Résultat</TableHead>
                                  <TableHead>Coût</TableHead>
                                  <TableHead></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(m.maintenance_logs ?? []).map((log) => (
                                  <TableRow key={log.id}>
                                    <TableCell className="text-xs">{fmtDate(log.start_datetime)}</TableCell>
                                    <TableCell className="text-xs">{interventionLabel(log.intervention_type)}</TableCell>
                                    <TableCell className="text-xs">{log.technician || "—"}</TableCell>
                                    <TableCell className="text-xs">{log.duration_hours != null ? `${log.duration_hours}h` : "—"}</TableCell>
                                    <TableCell>{resultBadge(log.result)}</TableCell>
                                    <TableCell className="text-xs">{fmtTND(log.cost)}</TableCell>
                                    <TableCell>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-red-400"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (confirm("Supprimer cette intervention ?")) deleteLogMutation.mutate(log.id);
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </AppShell>
  );
}