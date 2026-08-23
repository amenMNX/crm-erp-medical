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
  type ApiIncident,
} from "@/lib/incidents-api";
import { 
  fetchAgents, 
  fetchPatients,
  type ApiAgent,
  type ApiPatient,
} from "@/lib/tickets-api";
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

  // Use proper types and error handling
  const incidentsQuery = useQuery({ 
    queryKey: ["incidents"], 
    queryFn: fetchIncidents,
    retry: 1,
    staleTime: 1000 * 60, // 1 minute
  });
  
  const patientsQuery = useQuery({ 
    queryKey: ["patients"], 
    queryFn: fetchPatients,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const agentsQuery = useQuery({ 
    queryKey: ["agents"], 
    queryFn: fetchAgents,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Properly typed data with fallbacks
  const incidents = (incidentsQuery.data ?? []) as ApiIncident[];
  const patients = (patientsQuery.data ?? []) as ApiPatient[];
  const agents = (agentsQuery.data ?? []) as ApiAgent[];

  // Check for errors
  const hasError = incidentsQuery.isError || patientsQuery.isError || agentsQuery.isError;
  const isLoading = incidentsQuery.isLoading || patientsQuery.isLoading || agentsQuery.isLoading;

  // Log any errors to console for debugging
  if (incidentsQuery.error) console.error("Incidents error:", incidentsQuery.error);
  if (patientsQuery.error) console.error("Patients error:", patientsQuery.error);
  if (agentsQuery.error) console.error("Agents error:", agentsQuery.error);

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
        incident.numero?.toLowerCase().includes(q) ||
        incident.titre?.toLowerCase().includes(q) ||
        incident.description?.toLowerCase().includes(q) ||
        incident.equipment_or_location?.toLowerCase().includes(q) ||
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
      equipment_or_location: equipment_or_location || undefined,
      agents: agentValue ? [Number(agentValue)] : [],
    });
  }

  // Show error state
  if (hasError) {
    return (
      <AppShell title="Incidents">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h3 className="text-lg font-semibold">Unable to load incidents</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                There was a problem loading the data. Please try refreshing the page.
              </p>
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

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
                  {patients.length > 0 ? (
                    patients.map((patient) => (
                      <SelectItem key={patient.id} value={String(patient.id)}>
                        {patient.first_name} {patient.last_name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No patients available</SelectItem>
                  )}
                </SelectContent>
              </Select>

              <Select name="agent">
                <SelectTrigger>
                  <SelectValue placeholder="Assign agent optional" />
                </SelectTrigger>
                <SelectContent>
                  {agents.length > 0 ? (
                    agents.map((agent) => (
                      <SelectItem key={agent.id} value={String(agent.id)}>
                        {agent.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>No agents available</SelectItem>
                  )}
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

          {!isLoading && !hasError && (
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
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this incident?")) {
                              deleteMutation.mutate(incident.id);
                            }
                          }}
                        >
                          {deleteMutation.isPending && deleteMutation.variables === incident.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredIncidents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {query || statusFilter !== "all" ? (
                          <div className="flex flex-col items-center gap-2">
                            <p>No incidents match these filters.</p>
                            <Button 
                              variant="link" 
                              onClick={() => {
                                setQuery("");
                                setStatusFilter("all");
                              }}
                            >
                              Clear filters
                            </Button>
                          </div>
                        ) : (
                          "No incidents found."
                        )}
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