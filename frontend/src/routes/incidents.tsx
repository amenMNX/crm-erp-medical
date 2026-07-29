import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import {
  createIncident,
  deleteIncident,
  fetchIncidents,
  updateIncident,
} from "@/lib/incidents-api";
import { fetchAgents, fetchPatients } from "@/lib/tickets-api";
import type { TicketPriority, TicketStatus } from "@/lib/domain";

export const Route = createFileRoute("/incidents")({
  component: IncidentsPage,
});

const statuses: TicketStatus[] = ["Nouveau", "En cours", "En attente", "Résolu", "Fermé"];
const priorities: TicketPriority[] = ["Faible", "Moyenne", "Élevée", "Critique"];

function statusClass(status: TicketStatus) {
  if (status === "Nouveau") return "bg-blue-100 text-blue-700 border-0";
  if (status === "En cours") return "bg-amber-100 text-amber-700 border-0";
  if (status === "En attente") return "bg-purple-100 text-purple-700 border-0";
  if (status === "Résolu") return "bg-green-100 text-green-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

function IncidentsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const incidentsQuery = useQuery({ queryKey: ["incidents"], queryFn: fetchIncidents });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });

  const incidents = incidentsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createIncident,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: TicketStatus }) =>
      updateIncident(id, { statut }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIncident,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["incidents"] }),
  });

  const filteredIncidents = useMemo(() => {
    const q = query.trim().toLowerCase();

    return incidents.filter((incident) => {
      const matchesQuery =
        !q ||
        incident.numero.toLowerCase().includes(q) ||
        incident.titre.toLowerCase().includes(q) ||
        incident.description.toLowerCase().includes(q) ||
        incident.equipment_or_location.toLowerCase().includes(q) ||
        (incident.patient_name ?? "").toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || incident.statut === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [incidents, query, statusFilter]);

  function addIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const titre = String(formData.get("titre") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const priorite = String(formData.get("priorite") ?? "Moyenne") as TicketPriority;
    const patientValue = String(formData.get("patient") ?? "");
    const equipment_or_location = String(formData.get("equipment_or_location") ?? "").trim();
    const agentValue = String(formData.get("agent") ?? "");

    if (!titre || !description) return;

    createMutation.mutate({
      titre,
      description,
      priorite,
      statut: "Nouveau",
      patient: patientValue ? Number(patientValue) : null,
      equipment_or_location,
      agents: agentValue ? [Number(agentValue)] : [],
    });
  }

  const isLoading = incidentsQuery.isLoading || patientsQuery.isLoading || agentsQuery.isLoading;
  const loadError = incidentsQuery.error || patientsQuery.error || agentsQuery.error;

  return (
    <AppShell
      title="Incidents"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Incident
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addIncident} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Create incident</DialogTitle>
              </DialogHeader>

              <Input name="titre" placeholder="Incident title" required />
              <Textarea name="description" placeholder="Incident description" required />
              <Input name="equipment_or_location" placeholder="Equipment or location" />

              <Select name="priorite" defaultValue="Moyenne">
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

              <Select name="patient">
                <SelectTrigger>
                  <SelectValue placeholder="Related patient optional" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={String(patient.id)}>
                      {patient.first_name} {patient.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select name="agent">
                <SelectTrigger>
                  <SelectValue placeholder="Assign agent optional" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
          <div className="grid gap-3 md:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search incidents..."
                className="pl-9"
              />
            </div>

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
              <Loader2 className="h-4 w-4 animate-spin" /> Loading incidents...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load incidents. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Update</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredIncidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell className="font-mono">{incident.numero}</TableCell>
                      <TableCell className="font-medium">{incident.titre}</TableCell>
                      <TableCell>{incident.patient_name || "-"}</TableCell>
                      <TableCell>{incident.equipment_or_location || "-"}</TableCell>
                      <TableCell>{incident.priorite}</TableCell>
                      <TableCell>
                        <Badge className={statusClass(incident.statut)}>
                          {incident.statut}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={incident.statut}
                          onValueChange={(value) =>
                            updateMutation.mutate({
                              id: incident.id,
                              statut: value as TicketStatus,
                            })
                          }
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(incident.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredIncidents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No incidents match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}