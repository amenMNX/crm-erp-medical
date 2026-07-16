import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, Edit, Loader2 } from "lucide-react";
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
  updateTicket,
  type ApiTicket,
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

function TicketsPage() {
  const queryClient = useQueryClient();

  const ticketsQuery = useQuery({ queryKey: ["tickets"], queryFn: fetchTickets });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });

  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<ApiTicket | null>(null);
  const [createAgentSearch, setCreateAgentSearch] = useState("");
  const [editAgentSearch, setEditAgentSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const tickets = ticketsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
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
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
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

      return matchesQuery && matchesPriority && matchesStatus;
    });
  }, [tickets, query, priorityFilter, statusFilter]);

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
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
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
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
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
                      </TableCell>
                    </TableRow>
                  ))}
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
    </AppShell>
  );
}

function apiErrorMessage(err: ApiError): string {
  if (typeof err.body === "object" && err.body !== null) {
    const record = err.body as Record<string, unknown>;
    const firstKey = Object.keys(record)[0];
    const val = firstKey ? record[firstKey] : undefined;
    if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  }
  return err.message;
}