import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  approveLeaveRequest,
  createLeaveRequest,
  fetchLeaveRequests,
  rejectLeaveRequest,
  type LeaveStatus,
} from "@/lib/leaves-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/leaves")({
  component: LeavesPage,
});

const statuses: LeaveStatus[] = ["En attente", "Acceptée", "Refusée"];

function statusClass(status: LeaveStatus) {
  if (status === "Acceptée") return "bg-success/15 text-success border-0";
  if (status === "Refusée") return "bg-destructive/15 text-destructive border-0";
  return "bg-warning/15 text-warning border-0";
}

function LeavesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const leavesQuery = useQuery({ queryKey: ["leaves"], queryFn: fetchLeaveRequests });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const leaves = leavesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      setOpen(false);
      setFormError(null);
    },
    onError: () => setFormError("Failed to submit leave request."),
  });

  const approveMutation = useMutation({
    mutationFn: approveLeaveRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leaves"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectLeaveRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leaves"] }),
  });

  const filteredLeaves = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leaves.filter((leave) => {
      const matchesQuery =
        !q ||
        leave.employee_name.toLowerCase().includes(q) ||
        leave.motif.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || leave.statut === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [leaves, query, statusFilter]);

  function addLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const employee = Number(formData.get("employee"));
    const dateDebut = String(formData.get("dateDebut") ?? "");
    const dateFin = String(formData.get("dateFin") ?? "");
    const motif = String(formData.get("motif") ?? "").trim();

    if (!employee || !dateDebut || !dateFin || !motif) {
      setFormError("Employee, dates, and reason are required.");
      return;
    }

    createMutation.mutate({ employee, date_debut: dateDebut, date_fin: dateFin, motif });
  }

  const isLoading = leavesQuery.isLoading || employeesQuery.isLoading;
  const loadError = leavesQuery.error || employeesQuery.error;

  return (
    <AppShell
      title="Leaves"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Leave
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addLeave} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Submit leave request</DialogTitle>
              </DialogHeader>

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <Select name="employee" required>
                <SelectTrigger>
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input name="motif" placeholder="Reason" required />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="dateDebut" type="date" required />
                <Input name="dateFin" type="date" required />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Submitting..." : "Submit"}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leave request..."
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading leave requests...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load leave requests. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Decision</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredLeaves.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell className="font-medium">{leave.employee_name}</TableCell>
                      <TableCell>{leave.date_debut}</TableCell>
                      <TableCell>{leave.date_fin}</TableCell>
                      <TableCell>{leave.motif}</TableCell>
                      <TableCell>
                        <Badge className={statusClass(leave.statut)}>{leave.statut}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(leave.id)}
                            aria-label="Accept leave"
                          >
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={rejectMutation.isPending}
                            onClick={() => rejectMutation.mutate(leave.id)}
                            aria-label="Reject leave"
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredLeaves.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No leave requests found.
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
