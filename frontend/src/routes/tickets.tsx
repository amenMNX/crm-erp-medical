import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Edit, Loader2, MessageSquare, Wrench, X, Clock, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
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
import type { TicketPriority, TicketStatus } from "@/lib/domain";
import {
  createTicket,
  deleteTicket,
  fetchAgents,
  fetchPatients,
  fetchTickets,
  fetchSlaSummary,
  updateTicket,
  fetchTicketComments,
  createTicketComment,
  deleteTicketComment,
  formatSlaRemaining,
  type ApiTicket,
  type ApiTicketComment,
  type SlaStatus,
} from "@/lib/tickets-api";
import { ApiError } from "@/lib/api";

export const Route = createFileRoute("/tickets")({
  component: TicketsPage,
});

const priorities: TicketPriority[] = ["Faible", "Moyenne", "Élevée", "Critique"];
const statuses: TicketStatus[] = ["Nouveau", "En cours", "En attente", "Résolu", "Fermé"];

function badgeClass(value: TicketPriority | TicketStatus) {
  if (value === "Critique") return "bg-destructive/15 text-destructive border-0";
  if (value === "Élevée") return "bg-warning/15 text-warning border-0";
  if (value === "Résolu" || value === "Fermé") return "bg-success/15 text-success border-0";
  if (value === "En cours") return "bg-primary/15 text-primary border-0";
  return "bg-muted text-muted-foreground border-0";
}

function slaBadgeClass(status: SlaStatus) {
  if (status === "breached") return "bg-destructive/15 text-destructive border-0";
  if (status === "warning") return "bg-amber-100 text-amber-700 border-0";
  if (status === "resolved") return "bg-success/15 text-success border-0";
  return "bg-muted text-muted-foreground border-0";
}

function SlaKpiRow() {
  const slaQuery = useQuery({ queryKey: ["sla-summary"], queryFn: fetchSlaSummary, refetchInterval: 60_000 });
  const s = slaQuery.data;

  if (slaQuery.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-4 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-muted/30 h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!s) return null;

  const breachRate = s.breach_rate_30d != null ? `${(s.breach_rate_30d * 100).toFixed(0)}%` : "—";

  return (
    <div className="grid gap-3 sm:grid-cols-4 mb-4">
      <Card className="border shadow-none">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-primary/10 p-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Open tickets</p>
            <p className="text-xl font-semibold">{s.open}</p>
          </div>
        </CardContent>
      </Card>

      <Card className={`border shadow-none ${s.breached > 0 ? "border-destructive/40" : ""}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`rounded-md p-2 ${s.breached > 0 ? "bg-destructive/10" : "bg-muted"}`}>
            <ShieldAlert className={`h-4 w-4 ${s.breached > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SLA breached</p>
            <p className={`text-xl font-semibold ${s.breached > 0 ? "text-destructive" : ""}`}>{s.breached}</p>
          </div>
        </CardContent>
      </Card>

      <Card className={`border shadow-none ${s.warning > 0 ? "border-amber-300" : ""}`}>
        <CardContent className="flex items-center gap-3 p-4">
          <div className={`rounded-md p-2 ${s.warning > 0 ? "bg-amber-100" : "bg-muted"}`}>
            <AlertTriangle className={`h-4 w-4 ${s.warning > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SLA warning</p>
            <p className={`text-xl font-semibold ${s.warning > 0 ? "text-amber-600" : ""}`}>{s.warning}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-muted p-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Breach rate (30d)</p>
            <p className="text-xl font-semibold">{breachRate}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TicketsPage() {
  const queryClient = useQueryClient();

  // Bug fix: was `fetchAllPatients` (undefined) — must be `fetchPatients`
  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: () => fetchTickets() });
  const patientsQuery = useQuery({ queryKey: ["patients-all"], queryFn: fetchPatients });
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<ApiTicket | null>(null);
  const [createAgentSearch, setCreateAgentSearch] = useState("");
  const [editAgentSearch, setEditAgentSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Comment/intervention panel
  const [commentTicket, setCommentTicket] = useState<ApiTicket | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentIsIntervention, setCommentIsIntervention] = useState(false);

  const tickets = ticketsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["sla-summary"] });
      setOpen(false);
      setCreateAgentSearch("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? apiErrorMessage(err) : "Failed to create ticket.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTicket>[1] }) =>
      updateTicket(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["sla-summary"] });
      setEditDialogOpen(false);
      setEditingTicket(null);
      setEditAgentSearch("");
      setFormError(null);
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? apiErrorMessage(err) : "Failed to update ticket.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["sla-summary"] });
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
    },
  });

  // Comment mutations
  const addCommentMutation = useMutation({
    mutationFn: ({ ticketId, body, is_intervention }: { ticketId: number; body: string; is_intervention: boolean }) =>
      createTicketComment(ticketId, { body, is_intervention }),
    onSuccess: () => {
      if (commentTicket) {
        queryClient.invalidateQueries({ queryKey: ["ticket-comments", commentTicket.id] });
      }
      setCommentBody("");
      setCommentIsIntervention(false);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ ticketId, commentId }: { ticketId: number; commentId: number }) =>
      deleteTicketComment(ticketId, commentId),
    onSuccess: () => {
      if (commentTicket) {
        queryClient.invalidateQueries({ queryKey: ["ticket-comments", commentTicket.id] });
      }
    },
  });

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const agentStr = ticket.agent_details.map((a) => a.name).join(" ");
      const matchesQuery =
        !q ||
        ticket.numero.toLowerCase().includes(q) ||
        ticket.titre.toLowerCase().includes(q) ||
        ticket.client_name.toLowerCase().includes(q) ||
        agentStr.toLowerCase().includes(q);

      const matchesPriority = priorityFilter === "all" || ticket.priorite === priorityFilter;
      const matchesStatus = statusFilter === "all" || ticket.statut === statusFilter;
      const matchesSla =
        slaFilter === "all" ||
        (slaFilter === "breached" && ticket.sla_breached) ||
        (slaFilter === "warning" && ticket.sla_status === "warning") ||
        (slaFilter === "ok" && ticket.sla_status === "ok");

      return matchesQuery && matchesPriority && matchesStatus && matchesSla;
    });
  }, [tickets, query, priorityFilter, statusFilter, slaFilter]);

  function addTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const selectedAgents = Array.from(formData.getAll("agents")).map(Number);
    const clientId = Number(formData.get("client"));
    const titre = String(formData.get("titre") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!titre || !description || !clientId) {
      setFormError("Title, description, and client are required.");
      return;
    }

    createMutation.mutate({
      titre,
      description,
      priorite: String(formData.get("priorite") ?? "Faible") as TicketPriority,
      client: clientId,
      agents: selectedAgents,
    });
  }

  function openDeleteDialog(ticketId: number) {
    setTicketToDelete(ticketId);
    setDeleteDialogOpen(true);
  }

  function confirmDelete() {
    if (ticketToDelete === null) return;
    deleteMutation.mutate(ticketToDelete);
  }

  function openEditDialog(ticket: ApiTicket) {
    setEditingTicket(ticket);
    setFormError(null);
    setEditDialogOpen(true);
  }

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTicket) return;
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const selectedAgents = Array.from(formData.getAll("agents")).map(Number);

    updateMutation.mutate({
      id: editingTicket.id,
      payload: {
        titre: String(formData.get("titre") ?? "").trim(),
        description: String(formData.get("description") ?? "").trim(),
        priorite: String(formData.get("priorite") ?? editingTicket.priorite) as TicketPriority,
        statut: String(formData.get("statut") ?? editingTicket.statut) as TicketStatus,
        agents: selectedAgents,
      },
    });
  }

  const isLoading = ticketsQuery.isLoading || patientsQuery.isLoading || agentsQuery.isLoading;
  const loadError = ticketsQuery.error || patientsQuery.error || agentsQuery.error;

  return (
    <AppShell
      title="Tickets"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Ticket
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addTicket} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Create ticket</DialogTitle>
              </DialogHeader>

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <Input name="titre" placeholder="Ticket title" required />

              <Select name="client" required>
                <SelectTrigger>
                  <SelectValue placeholder="Client / patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={String(patient.id)}>
                      {patient.first_name} {patient.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Textarea name="description" placeholder="Description" required />

              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="priorite" defaultValue="Faible">
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Agents</label>
                <Input
                  placeholder="Search agents..."
                  value={createAgentSearch}
                  onChange={(e) => setCreateAgentSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                  {agents
                    .filter((agent) =>
                      agent.name.toLowerCase().includes(createAgentSearch.toLowerCase())
                    )
                    .map((agent) => (
                      <div key={agent.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="agents"
                          value={agent.id}
                          id={`agent-${agent.id}`}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <label htmlFor={`agent-${agent.id}`} className="text-sm cursor-pointer">
                          {agent.name}
                        </label>
                      </div>
                    ))}
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* ── SLA KPI banner ─────────────────────────────────────────────── */}
      <SlaKpiRow />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_160px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ticket..."
                className="pl-9"
              />
            </div>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {priorities.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* SLA filter (new) */}
            <Select value={slaFilter} onValueChange={setSlaFilter}>
              <SelectTrigger>
                <SelectValue placeholder="SLA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SLA</SelectItem>
                <SelectItem value="breached">Breached</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load tickets. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SLA</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className={
                        ticket.sla_breached
                          ? "bg-destructive/5 hover:bg-destructive/10"
                          : ticket.sla_status === "warning"
                          ? "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20"
                          : ""
                      }
                    >
                      <TableCell className="font-medium">{ticket.numero}</TableCell>
                      <TableCell>{ticket.titre}</TableCell>
                      <TableCell>{ticket.client_name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {ticket.agent_details.map((agent) => (
                            <Badge key={agent.id} variant="outline" className="block w-fit">
                              {agent.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={badgeClass(ticket.priorite)}>{ticket.priorite}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={badgeClass(ticket.statut)}>{ticket.statut}</Badge>
                      </TableCell>
                      {/* SLA column (new) */}
                      <TableCell>
                        {ticket.sla_status !== "ok" || ticket.sla_breached ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge className={slaBadgeClass(ticket.sla_status)}>
                              {ticket.sla_status === "breached"
                                ? "Breached"
                                : ticket.sla_status === "warning"
                                ? "Warning"
                                : ticket.sla_status === "resolved"
                                ? "Resolved"
                                : "OK"}
                            </Badge>
                            {ticket.sla_remaining_minutes !== null && (
                              <span className="text-[11px] text-muted-foreground">
                                {formatSlaRemaining(ticket.sla_remaining_minutes)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ticket.created_at.slice(0, 10)}
                      </TableCell>
                      <TableCell className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(ticket)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openDeleteDialog(ticket.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Comments & interventions"
                          onClick={() => {
                            setCommentTicket(ticket);
                            setCommentBody("");
                            setCommentIsIntervention(false);
                          }}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredTickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        No tickets match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <form onSubmit={saveEdit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Edit Ticket</DialogTitle>
            </DialogHeader>

            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <Input
              name="titre"
              placeholder="Ticket title"
              defaultValue={editingTicket?.titre ?? ""}
              required
            />
            <Textarea
              name="description"
              placeholder="Description"
              defaultValue={editingTicket?.description ?? ""}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select name="priorite" defaultValue={editingTicket?.priorite ?? "Faible"}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select name="statut" defaultValue={editingTicket?.statut ?? "Nouveau"}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Assign Agents</label>
              <Input
                placeholder="Search agents..."
                value={editAgentSearch}
                onChange={(e) => setEditAgentSearch(e.target.value)}
                className="mb-2"
              />
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                {agents
                  .filter((agent) =>
                    agent.name.toLowerCase().includes(editAgentSearch.toLowerCase())
                  )
                  .map((agent) => (
                    <div key={agent.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="agents"
                        value={agent.id}
                        id={`edit-agent-${agent.id}`}
                        defaultChecked={editingTicket?.agents.includes(agent.id) ?? false}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor={`edit-agent-${agent.id}`} className="text-sm cursor-pointer">
                        {agent.name}
                      </label>
                    </div>
                  ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this ticket? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Comment / Intervention Sheet ─────────────────────────────── */}
      <CommentSheet
        ticket={commentTicket}
        onClose={() => setCommentTicket(null)}
        commentBody={commentBody}
        setCommentBody={setCommentBody}
        commentIsIntervention={commentIsIntervention}
        setCommentIsIntervention={setCommentIsIntervention}
        onSubmit={() => {
          if (!commentTicket || !commentBody.trim()) return;
          addCommentMutation.mutate({
            ticketId: commentTicket.id,
            body: commentBody.trim(),
            is_intervention: commentIsIntervention,
          });
        }}
        onDeleteComment={(commentId) => {
          if (!commentTicket) return;
          deleteCommentMutation.mutate({ ticketId: commentTicket.id, commentId });
        }}
        isSubmitting={addCommentMutation.isPending}
      />
    </AppShell>
  );
}

function apiErrorMessage(err: ApiError): string {
  if (typeof err.data === "object" && err.data !== null) {
    const record = err.data as Record<string, unknown>;
    const firstKey = Object.keys(record)[0];
    const val = firstKey ? record[firstKey] : undefined;
    if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  }
  return err.message;
}

// ─── Comment / Intervention Sheet ───────────────────────────────────────────

type CommentSheetProps = {
  ticket: ApiTicket | null;
  onClose: () => void;
  commentBody: string;
  setCommentBody: (v: string) => void;
  commentIsIntervention: boolean;
  setCommentIsIntervention: (v: boolean) => void;
  onSubmit: () => void;
  onDeleteComment: (commentId: number) => void;
  isSubmitting: boolean;
};

function CommentSheet({
  ticket,
  onClose,
  commentBody,
  setCommentBody,
  commentIsIntervention,
  setCommentIsIntervention,
  onSubmit,
  onDeleteComment,
  isSubmitting,
}: CommentSheetProps) {
  const commentsQuery = useQuery({
    queryKey: ["ticket-comments", ticket?.id],
    queryFn: () => fetchTicketComments(ticket!.id),
    enabled: !!ticket,
  });

  const comments = commentsQuery.data ?? [];

  return (
    <Sheet open={!!ticket} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex flex-col w-full sm:max-w-lg gap-0 p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {ticket?.numero} — Comments &amp; Interventions
          </SheetTitle>
        </SheetHeader>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {commentsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {!commentsQuery.isLoading && comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No comments yet. Add the first one below.
            </p>
          )}
          {comments.map((comment: ApiTicketComment) => (
            <div
              key={comment.id}
              className={`rounded-lg border p-3 text-sm ${
                comment.is_intervention
                  ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                  : "border-border bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  {comment.is_intervention && (
                    <Wrench className="h-3 w-3 text-amber-600" />
                  )}
                  {comment.author_name}
                  {comment.is_intervention && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 ml-1">
                      Intervention
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{new Date(comment.created_at).toLocaleString()}</span>
                  <button
                    onClick={() => onDeleteComment(comment.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">{comment.body}</p>
            </div>
          ))}
        </div>

        {/* Compose */}
        <div className="border-t px-6 py-4 space-y-3">
          <Textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Write a comment or describe the intervention…"
            className="resize-none"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={commentIsIntervention}
                onChange={(e) => setCommentIsIntervention(e.target.checked)}
                className="rounded"
              />
              <Wrench className="h-3.5 w-3.5 text-amber-600" />
              Mark as intervention
            </label>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={isSubmitting || !commentBody.trim()}
            >
              {isSubmitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Posting…</>
              ) : (
                "Post"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}