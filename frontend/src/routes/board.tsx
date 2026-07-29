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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Users,
  Clock,
  AlertCircle,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchTickets,
  updateTicket,
  createTicket,
  fetchPatients,
  fetchAgents,
  type ApiTicket,
  type TicketWritePayload,
} from "@/lib/tickets-api";
import type { TicketStatus, TicketPriority } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/board")({
  head: () => ({
    meta: [
      { title: "Board — Base" },
      {
        name: "description",
        content: "Kanban board of support tickets by status.",
      },
    ],
  }),
  component: BoardPage,
});

const STATUSES: TicketStatus[] = [
  "Nouveau",
  "En cours",
  "En attente",
  "Résolu",
  "Fermé",
];

const PRIORITIES: TicketPriority[] = ["Faible", "Moyenne", "Élevée", "Critique"];

const PRIORITY_CONFIG: Record<
  TicketPriority,
  { color: string; label: string }
> = {
  Faible: {
    color: "bg-slate-100 text-slate-700 border-slate-200",
    label: "Faible",
  },
  Moyenne: {
    color: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Moyenne",
  },
  Élevée: {
    color: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Élevée",
  },
  Critique: {
    color: "bg-red-50 text-red-700 border-red-200",
    label: "Critique",
  },
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  Nouveau: "border-t-blue-500",
  "En cours": "border-t-amber-500",
  "En attente": "border-t-purple-500",
  Résolu: "border-t-green-500",
  Fermé: "border-t-slate-400",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60),
  );

  if (diffInHours < 1) return "Just now";
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

function BoardPage() {
  const queryClient = useQueryClient();
  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: fetchTickets });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });

  const tickets = ticketsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  // Track which column has the inline add form open
  const [addingStatus, setAddingStatus] = useState<TicketStatus | null>(null);
  const [formData, setFormData] = useState({
    titre: "",
    description: "",
    priorite: "Moyenne" as TicketPriority,
    client: "",
    agents: [] as number[],
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: TicketStatus }) =>
      updateTicket(id, { statut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket moved successfully");
    },
    onError: (error) => {
      console.error("Move error:", error);
      toast.error("Couldn't move the ticket");
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TicketWritePayload) => createTicket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setAddingStatus(null);
      resetForm();
      toast.success("Ticket created successfully");
    },
    onError: (error) => {
      console.error("Create error:", error);
      toast.error(
        `Couldn't create the ticket: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  function resetForm() {
    setFormData({
      titre: "",
      description: "",
      priorite: "Moyenne",
      client: "",
      agents: [],
    });
  }

  function move(t: ApiTicket, direction: -1 | 1) {
    const idx = STATUSES.indexOf(t.statut);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= STATUSES.length) return;
    moveMutation.mutate({ id: t.id, statut: STATUSES[nextIdx] });
  }

  function handleAddSubmit(status: TicketStatus) {
    if (!formData.titre.trim()) {
      toast.error("Title is required");
      return;
    }

    if (!formData.client) {
      toast.error("Please select a client");
      return;
    }

    const payload: TicketWritePayload = {
      titre: formData.titre.trim(),
      description: formData.description.trim(),
      priorite: formData.priorite,
      statut: status,
      client: parseInt(formData.client, 10),
      agents: formData.agents,
    };

    createMutation.mutate(payload);
  }

  function cancelAdd() {
    setAddingStatus(null);
    resetForm();
  }

  function toggleAgent(agentId: number) {
    setFormData((prev) => ({
      ...prev,
      agents: prev.agents.includes(agentId)
        ? prev.agents.filter((id) => id !== agentId)
        : [...prev.agents, agentId],
    }));
  }

  const isLoading =
    ticketsQuery.isLoading || patientsQuery.isLoading || agentsQuery.isLoading;

  return (
    <AppShell title="Board">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      ) : ticketsQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Couldn't load tickets. Please refresh the page.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STATUSES.map((status) => {
              const count = tickets.filter((t) => t.statut === status).length;
              return (
                <Card
                  key={status}
                  className={cn("border-t-2", STATUS_COLORS[status])}
                >
                  <CardContent className="p-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {status}
                    </p>
                    <p className="text-2xl font-bold mt-1">{count}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Kanban Board */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max">
              {STATUSES.map((status) => {
                const colTickets = tickets.filter((t) => t.statut === status);
                const statusIdx = STATUSES.indexOf(status);
                const isAdding = addingStatus === status;

                return (
                  <div key={status} className="w-80 flex-shrink-0">
                    {/* Column Header */}
                    <div className="sticky top-0 z-10 bg-background pb-3">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full",
                              status === "Nouveau" && "bg-blue-500",
                              status === "En cours" && "bg-amber-500",
                              status === "En attente" && "bg-purple-500",
                              status === "Résolu" && "bg-green-500",
                              status === "Fermé" && "bg-slate-400",
                            )}
                          />
                          <h3 className="font-semibold text-sm">{status}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="rounded-full text-xs"
                          >
                            {colTickets.length}
                          </Badge>
                          {!isAdding && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-muted"
                              onClick={() => {
                                setAddingStatus(status);
                                resetForm();
                              }}
                              title={`Add ticket to ${status}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tickets */}
                    <div className="space-y-3">
                      {/* Inline Quick Add Form */}
                      {isAdding && (
                        <Card className="border-primary/50 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
                          <CardContent className="p-3 space-y-3">
                            <div className="space-y-2">
                              <Input
                                autoFocus
                                placeholder="Ticket title *"
                                value={formData.titre}
                                onChange={(e) =>
                                  setFormData({ ...formData, titre: e.target.value })
                                }
                                disabled={createMutation.isPending}
                                className="h-9 text-sm"
                              />

                              <Textarea
                                placeholder="Description"
                                value={formData.description}
                                onChange={(e) =>
                                  setFormData({ ...formData, description: e.target.value })
                                }
                                disabled={createMutation.isPending}
                                className="min-h-[60px] text-sm resize-none"
                              />

                              <Select
                                value={formData.priorite}
                                onValueChange={(value: TicketPriority) =>
                                  setFormData({ ...formData, priorite: value })
                                }
                                disabled={createMutation.isPending}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder="Priority" />
                                </SelectTrigger>
                                <SelectContent>
                                  {PRIORITIES.map((p) => (
                                    <SelectItem key={p} value={p}>
                                      {p}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={formData.client}
                                onValueChange={(value) =>
                                  setFormData({ ...formData, client: value })
                                }
                                disabled={createMutation.isPending}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder="Select client *" />
                                </SelectTrigger>
                                <SelectContent>
                                  {patients.map((patient) => (
                                    <SelectItem key={patient.id} value={patient.id.toString()}>
                                      {patient.first_name} {patient.last_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Assign agents (optional)
                                </label>
                                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                  {agents.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No agents available</p>
                                  ) : (
                                    agents.map((agent) => {
                                      const isSelected = formData.agents.includes(agent.id);
                                      return (
                                        <Button
                                          key={agent.id}
                                          variant={isSelected ? "default" : "outline"}
                                          size="sm"
                                          className="h-7 text-xs px-2"
                                          onClick={() => toggleAgent(agent.id)}
                                          disabled={createMutation.isPending}
                                        >
                                          {agent.name}
                                        </Button>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t">
                              <Button
                                size="sm"
                                className="flex-1 h-8 text-xs"
                                disabled={
                                  !formData.titre.trim() ||
                                  !formData.client ||
                                  createMutation.isPending
                                }
                                onClick={() => handleAddSubmit(status)}
                              >
                                {createMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Plus className="h-3 w-3 mr-1" />
                                )}
                                Create
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={cancelAdd}
                                disabled={createMutation.isPending}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {colTickets.map((t) => (
                        <Card
                          key={t.id}
                          className="group hover:shadow-lg transition-all duration-200 border-l-4 border-l-transparent hover:border-l-primary"
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Priority & Title */}
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <Badge
                                  className={cn(
                                    "text-xs font-medium border",
                                    PRIORITY_CONFIG[t.priorite].color,
                                  )}
                                >
                                  {t.priorite}
                                </Badge>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatTimeAgo(t.created_at)}
                                </span>
                              </div>
                              <p className="text-sm font-semibold leading-tight line-clamp-2">
                                {t.titre}
                              </p>
                            </div>

                            {/* Client Info */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                                {t.numero}
                              </span>
                              <span>·</span>
                              <span className="truncate">{t.client_name}</span>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-2 border-t">
                              {/* Agents */}
                              <div className="flex -space-x-2">
                                {t.agent_details.length === 0 ? (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                                    <Users className="h-3 w-3" />
                                    <span>Unassigned</span>
                                  </div>
                                ) : (
                                  t.agent_details.map((a) => (
                                    <Avatar
                                      key={a.id}
                                      className="h-7 w-7 border-2 border-background ring-2 ring-muted"
                                    >
                                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                                        {initials(a.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))
                                )}
                              </div>

                              {/* Move Buttons */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-muted"
                                  disabled={
                                    statusIdx === 0 || moveMutation.isPending
                                  }
                                  onClick={() => move(t, -1)}
                                  title="Move left"
                                >
                                  <ArrowLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 hover:bg-muted"
                                  disabled={
                                    statusIdx === STATUSES.length - 1 ||
                                    moveMutation.isPending
                                  }
                                  onClick={() => move(t, 1)}
                                  title="Move right"
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
                          <p className="text-xs text-muted-foreground">
                            No tickets
                          </p>
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