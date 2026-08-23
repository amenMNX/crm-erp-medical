import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
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
  createComplaint,
  fetchComplaints,
  updateComplaint,
  type ApiComplaint,
} from "@/lib/complaints-api";
import { fetchPatients, type ApiPatient } from "@/lib/tickets-api";
import type { ComplaintStatus } from "@/lib/domain";

export const Route = createFileRoute("/complaints")({
  component: ComplaintsPage,
});

const statuses: ComplaintStatus[] = ["Nouvelle", "En traitement", "Résolue", "Fermée"];

function statusClass(status: ComplaintStatus) {
  if (status === "Nouvelle") return "bg-primary/15 text-primary border-0";
  if (status === "En traitement") return "bg-amber-100 text-amber-700 border-0";
  if (status === "Résolue") return "bg-green-100 text-green-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

function ComplaintsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const complaintsQuery = useQuery({
    queryKey: ["complaints"],
    queryFn: fetchComplaints,
    retry: 1,
    staleTime: 1000 * 60, // 1 minute
  });

  const patientsQuery = useQuery({
    queryKey: ["patients"],
    queryFn: fetchPatients,
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Properly typed data with fallbacks
  const complaints = (complaintsQuery.data ?? []) as ApiComplaint[];
  const patients = (patientsQuery.data ?? []) as ApiPatient[];

  const hasError = complaintsQuery.isError || patientsQuery.isError;
  const isLoading = complaintsQuery.isLoading || patientsQuery.isLoading;

  // Log errors for debugging
  if (complaintsQuery.error) {
    console.error("Complaints error:", complaintsQuery.error);
  }
  if (patientsQuery.error) {
    console.error("Patients error:", patientsQuery.error);
  }

  const createMutation = useMutation({
    mutationFn: createComplaint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setOpen(false);
    },
    onError: (error) => {
      console.error("Failed to create complaint:", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: ComplaintStatus }) =>
      updateComplaint(id, { statut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (error) => {
      console.error("Failed to update complaint:", error);
    },
  });

  const filteredComplaints = useMemo(() => {
    const q = query.trim().toLowerCase();

    return complaints.filter((complaint) => {
      const matchesQuery =
        !q ||
        (complaint.client_name?.toLowerCase() || "").includes(q) ||
        (complaint.description?.toLowerCase() || "").includes(q);

      const matchesStatus = statusFilter === "all" || complaint.statut === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [complaints, query, statusFilter]);

  function addComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const client = Number(formData.get("client"));
    const description = String(formData.get("description") ?? "").trim();

    if (!client || !description) return;

    createMutation.mutate({
      client,
      description,
    });
  }

  function updateStatus(id: number, statut: ComplaintStatus) {
    updateMutation.mutate({ id, statut });
  }

  // Show error state
  if (hasError) {
    return (
      <AppShell title="Réclamations">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h3 className="text-lg font-semibold">Unable to load complaints</h3>
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
      title="Réclamations"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Complaint
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addComplaint} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Create complaint</DialogTitle>
              </DialogHeader>

              <Select name="client" required>
                <SelectTrigger>
                  <SelectValue placeholder="Client / patient" />
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

              <Textarea name="description" placeholder="Complaint description" required />

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
                placeholder="Search complaint..."
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
              <Loader2 className="h-4 w-4 animate-spin" /> Loading complaints...
            </div>
          )}

          {!isLoading && !hasError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Update status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredComplaints.map((complaint) => (
                    <TableRow key={complaint.id}>
                      <TableCell className="font-medium">{complaint.client_name}</TableCell>
                      <TableCell className="max-w-md">{complaint.description}</TableCell>
                      <TableCell>
                        <Badge className={statusClass(complaint.statut)}>
                          {complaint.statut}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={complaint.statut}
                          onValueChange={(value) =>
                            updateStatus(complaint.id, value as ComplaintStatus)
                          }
                        >
                          <SelectTrigger className="w-[170px]">
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
                      <TableCell className="text-muted-foreground">
                        {complaint.created_at?.slice(0, 10) || "-"}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredComplaints.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {query || statusFilter !== "all" ? (
                          <div className="flex flex-col items-center gap-2">
                            <p>No complaints match these filters.</p>
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
                          "No complaints found."
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