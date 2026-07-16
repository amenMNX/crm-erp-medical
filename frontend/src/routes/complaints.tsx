import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
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
} from "@/lib/complaints-api";
import type { ComplaintStatus } from "@/lib/domain";
import { fetchPatients } from "@/lib/tickets-api";

export const Route = createFileRoute("/complaints")({
  component: ComplaintsPage,
});

const statuses: ComplaintStatus[] = ["Nouvelle", "En traitement", "Résolue", "Fermée"];

function statusClass(status: ComplaintStatus) {
  if (status === "Nouvelle") return "bg-primary/15 text-primary border-0";
  if (status === "En traitement") return "bg-warning/15 text-warning border-0";
  if (status === "Résolue") return "bg-success/15 text-success border-0";
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
  });

  const patientsQuery = useQuery({
    queryKey: ["patients"],
    queryFn: fetchPatients,
  });

  const complaints = complaintsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createComplaint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, statut }: { id: number; statut: ComplaintStatus }) =>
      updateComplaint(id, { statut }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
  });

  const filteredComplaints = useMemo(() => {
    const q = query.trim().toLowerCase();

    return complaints.filter((complaint) => {
      const matchesQuery =
        !q ||
        complaint.client_name.toLowerCase().includes(q) ||
        complaint.description.toLowerCase().includes(q);

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

  const isLoading = complaintsQuery.isLoading || patientsQuery.isLoading;
  const loadError = complaintsQuery.error || patientsQuery.error;

  return (
    <AppShell
      title="Complaints"
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
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={String(patient.id)}>
                      {patient.first_name} {patient.last_name}
                    </SelectItem>
                  ))}
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

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load complaints. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
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
                        {complaint.created_at.slice(0, 10)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredComplaints.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No complaints match these filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
