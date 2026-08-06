import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft, ArrowRight, Loader2, Users, Clock,
  AlertCircle, Plus, X, ShieldAlert, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchTickets, fetchSlaSummary, updateTicket, createTicket,
  fetchPatients, fetchAgents, formatSlaRemaining,
  type ApiTicket, type TicketWritePayload, type SlaStatus,
} from "@/lib/tickets-api";
import type { TicketStatus, TicketPriority } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Board — Tickets" },
      { name: "description", content: "Kanban board of support tickets by status." },
    ],
  }),
  component: BoardPage,
});

const STATUSES: TicketStatus[] = ["Nouveau", "En cours", "En attente", "Résolu", "Fermé"];
const PRIORITIES: TicketPriority[] = ["Faible", "Moyenne", "Élevée", "Critique"];

const PRIORITY_CONFIG: Record<TicketPriority, { color: string }> = {
  Faible:   { color: "bg-slate-100 text-slate-700 border-slate-200" },
  Moyenne:  { color: "bg-blue-50 text-blue-700 border-blue-200" },
  Élevée:   { color: "bg-amber-50 text-amber-700 border-amber-200" },
  Critique: { color: "bg-red-50 text-red-700 border-red-200" },
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  Nouveau:      "border-t-blue-500",
  "En cours":   "border-t-amber-500",
  "En attente": "border-t-purple-500",
  Résolu:       "border-t-green-500",
  Fermé:        "border-t-slate-400",
};

// SLA badge config — colour + icon per sla_status value
const SLA_CONFIG: Record<SlaStatus, {
  label: (mins: number | null) => string;
  className: string;
  Icon: React.ElementType | null;
}> = {
  ok: {
    label: (m) => formatSlaRemaining(m),
    className: "bg-green-50 text-green-700 border-green-200",
    Icon: Clock,
  },
  warning: {
    label: (m) => formatSlaRemaining(m),
    className: "bg-amber-50 text-amber-700 border-amber-200",
    Icon: AlertTriangle,
  },
  breached: {
    label: (m) => formatSlaRemaining(m),
    className: "bg-red-50 text-red-700 border-red-200 animate-pulse",
    Icon: ShieldAlert,
  },
  resolved: { label: () => "", className: "", Icon: null },
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function SlaBadge({ ticket }: { ticket: ApiTicket }) {
  const cfg = SLA_CONFIG[ticket.sla_status];
  if (ticket.sla_status === "resolved" || !cfg.Icon) return null;
  const Icon = cfg.Icon;
  const label = cfg.label(ticket.sla_remaining_minutes);
  if (!label) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5", cfg.className)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function BoardPage() {
  const queryClient = useQueryClient();

  const ticketsQuery  = useQuery({ queryKey: ["tickets"], queryFn: () => fetchTickets() });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const agentsQuery   = useQuery({ queryKey: ["agents"],   queryFn: fetchAgents });
  const slaQuery      = useQuery({
    queryKey: ["sla-summary"],
    queryFn: fetchSlaSummary,
    refetchInterval: 60_000, // refresh SLA summary every minute
  });

  const tickets  = ticketsQuery.data  ?? [];
  const patients = patientsQuery.data ?? [];
  const agents   = agentsQuery.data   ?? [];
  const sla      = slaQuery.data;

  const [addingStatus, setAddingStatus] = useState<TicketStatus | null>(null);
  const [formData, setFormData] = useState({
    titre: "", description: "",
    priorite: "Moyenne" as TicketPriority,
    client: "", agents: [] as number[],
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: TicketStatus }) =>
      updateTicket(id, { statut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["sla-summary"] });
      toast.success("Ticket déplacé");
    },
    onError: () => toast.error("Impossible de déplacer le ticket"),
  });

  const createMutation = useMutation({
    mutationFn: (data: TicketWritePayload) => createTicket(data),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["sla-summary"] });
      setAddingStatus(null);
      resetForm();
      toast.success(`Ticket ${ticket.numero} créé`, {
        description: `SLA : ${formatSlaRemaining(ticket.sla_remaining_minutes)}`,
      });
    },
    onError: (err) => toast.error(`Erreur : ${err instanceof Error ? err.message : "Inconnu"}`),
  });

  function resetForm() {
    setFormData({ titre: "", description: "", priorite: "Moyenne", client: "", agents: [] });
  }

  function move(t: ApiTicket, direction: -1 | 1) {
    const idx = STATUSES.indexOf(t.statut);
    const next = idx + direction;
    if (next < 0 || next >= STATUSES.length) return;
    moveMutation.mutate({ id: t.id, statut: STATUSES[next] });
  }

  function handleAddSubmit(status: TicketStatus) {
    if (!formData.titre.trim()) { toast.error("Le titre est obligatoire"); return; }
    if (!formData.client) { toast.error("Sélectionnez un patient"); return; }
    createMutation.mutate({
      titre: formData.titre.trim(),
      description: formData.description.trim(),
      priorite: formData.priorite,
      statut: status,
      client: parseInt(formData.client, 10),
      agents: formData.agents,
    });
  }

  const isLoading = ticketsQuery.isLoading || patientsQuery.isLoading || agentsQuery.isLoading;

  return (
    <AppShell title="Board">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Chargement…</p>
        </div>
      ) : ticketsQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Impossible de charger les tickets. Actualisez la page.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">

          {/* ── SLA summary bar ── */}
          {sla && (
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Ouverts</span>
                <span className="font-bold">{sla.open}</span>
              </div>
              {sla.breached > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <ShieldAlert className="h-4 w-4" />
                  <span>SLA dépassé</span>
                  <span className="font-bold">{sla.breached}</span>
                </div>
              )}
              {sla.warning > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Alerte SLA</span>
                  <span className="font-bold">{sla.warning}</span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
                Taux de dépassement (30j)
                <span className={cn("font-bold", sla.breach_rate_30d > 10 ? "text-red-600" : "text-foreground")}>
                  {sla.breach_rate_30d}%
                </span>
              </div>
            </div>
          )}

          {/* ── Status count cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STATUSES.map((status) => {
              const count = tickets.filter((t) => t.statut === status).length;
              const breachedInCol = tickets.filter(
                (t) => t.statut === status && t.sla_status === "breached"
              ).length;
              return (
                <Card key={status} className={cn("border-t-2", STATUS_COLORS[status])}>
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {status}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-2xl font-bold">{count}</p>
                      {breachedInCol > 0 && (
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-0.5">
                          <ShieldAlert className="h-3 w-3" />
                          {breachedInCol}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Kanban board ── */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {STATUSES.map((status) => {
                const colTickets = tickets.filter((t) => t.statut === status);
                // Sort: breached first, then warning, then ok
                const sorted = [...colTickets].sort((a, b) => {
                  const order: Record<string, number> = { breached: 0, warning: 1, ok: 2, resolved: 3 };
                  return (order[a.sla_status] ?? 3) - (order[b.sla_status] ?? 3);
                });
                const statusIdx = STATUSES.indexOf(status);
                const isAdding = addingStatus === status;

                return (
                  <div key={status} className="w-80 flex-shrink-0">
                    {/* Column header */}
                    <div className="sticky top-0 z-10 bg-background pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            status === "Nouveau"      && "bg-blue-500",
                            status === "En cours"     && "bg-amber-500",
                            status === "En attente"   && "bg-purple-500",
                            status === "Résolu"       && "bg-green-500",
                            status === "Fermé"        && "bg-slate-400",
                          )} />
                          <h3 className="font-semibold text-sm">{status}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-full text-xs">
                            {colTickets.length}
                          </Badge>
                          {!isAdding && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { setAddingStatus(status); resetForm(); }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* Inline add form */}
                      {isAdding && (
                        <Card className="border-primary/50 shadow-md">
                          <CardContent className="p-3 space-y-3">
                            <Input
                              autoFocus placeholder="Titre du ticket *"
                              value={formData.titre}
                              onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                              disabled={createMutation.isPending}
                              className="h-9 text-sm"
                            />
                            <Textarea
                              placeholder="Description"
                              value={formData.description}
                              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                              disabled={createMutation.isPending}
                              className="min-h-[60px] text-sm resize-none"
                            />
                            <Select
                              value={formData.priorite}
                              onValueChange={(v: TicketPriority) => setFormData({ ...formData, priorite: v })}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Priorité" />
                              </SelectTrigger>
                              <SelectContent>
                                {PRIORITIES.map((p) => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={formData.client}
                              onValueChange={(v) => setFormData({ ...formData, client: v })}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Sélectionner un patient *" />
                              </SelectTrigger>
                              <SelectContent>
                                {patients.map((p) => (
                                  <SelectItem key={p.id} value={p.id.toString()}>
                                    {p.first_name} {p.last_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex flex-wrap gap-1">
                              {agents.map((a) => {
                                const sel = formData.agents.includes(a.id);
                                return (
                                  <Button
                                    key={a.id} size="sm"
                                    variant={sel ? "default" : "outline"}
                                    className="h-7 text-xs px-2"
                                    onClick={() => setFormData((prev) => ({
                                      ...prev,
                                      agents: sel
                                        ? prev.agents.filter((id) => id !== a.id)
                                        : [...prev.agents, a.id],
                                    }))}
                                  >
                                    {a.name}
                                  </Button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t">
                              <Button
                                size="sm" className="flex-1 h-8 text-xs"
                                disabled={!formData.titre.trim() || !formData.client || createMutation.isPending}
                                onClick={() => handleAddSubmit(status)}
                              >
                                {createMutation.isPending
                                  ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  : <Plus className="h-3 w-3 mr-1" />}
                                Créer
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-8 w-8 p-0"
                                onClick={() => { setAddingStatus(null); resetForm(); }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Ticket cards — breached shown first (sorted above) */}
                      {sorted.map((t) => (
                        <Card
                          key={t.id}
                          className={cn(
                            "group hover:shadow-lg transition-all duration-200 border-l-4",
                            t.sla_status === "breached"
                              ? "border-l-red-500 bg-red-50/30"
                              : t.sla_status === "warning"
                              ? "border-l-amber-400"
                              : "border-l-transparent hover:border-l-primary",
                          )}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <Badge className={cn("text-xs font-medium border", PRIORITY_CONFIG[t.priorite].color)}>
                                {t.priorite}
                              </Badge>
                              {/* SLA badge */}
                              <SlaBadge ticket={t} />
                            </div>

                            <p className="text-sm font-semibold leading-tight line-clamp-2">
                              {t.titre}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                                {t.numero}
                              </span>
                              <span>·</span>
                              <span className="truncate">{t.client_name}</span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t">
                              {/* Agents */}
                              <div className="flex -space-x-2">
                                {t.agent_details.length === 0 ? (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                                    <Users className="h-3 w-3" />
                                    <span>Non assigné</span>
                                  </div>
                                ) : (
                                  t.agent_details.map((a) => (
                                    <Avatar key={a.id} className="h-7 w-7 border-2 border-background ring-2 ring-muted">
                                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                                        {initials(a.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))
                                )}
                              </div>

                              {/* Move buttons */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  disabled={statusIdx === 0 || moveMutation.isPending}
                                  onClick={() => move(t, -1)}
                                  title="Déplacer à gauche"
                                >
                                  <ArrowLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7"
                                  disabled={statusIdx === STATUSES.length - 1 || moveMutation.isPending}
                                  onClick={() => move(t, 1)}
                                  title="Déplacer à droite"
                                >
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      {colTickets.length === 0 && !isAdding && (
                        <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
                          <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                          <p className="text-xs text-muted-foreground">Aucun ticket</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}