import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search, Wallet, X } from "lucide-react";
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
  approveSalaryAdvance,
  createSalaryAdvance,
  fetchSalaryAdvances,
  markSalaryAdvanceRepaid,
  rejectSalaryAdvance,
  type SalaryAdvanceStatus,
} from "@/lib/salary-advances-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/salary-advances")({
  component: SalaryAdvancesPage,
});

const statuses: SalaryAdvanceStatus[] = ["En attente", "Approuvée", "Refusée", "Remboursée"];

function statusClass(status: SalaryAdvanceStatus) {
  if (status === "Approuvée") return "bg-success/15 text-success border-0";
  if (status === "Refusée") return "bg-destructive/15 text-destructive border-0";
  if (status === "Remboursée") return "bg-muted text-muted-foreground border-0";
  return "bg-warning/15 text-warning border-0";
}

function formatAmount(amount: string) {
  const value = Number(amount);
  return Number.isNaN(value) ? amount : value.toFixed(2);
}

function SalaryAdvancesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const advancesQuery = useQuery({ queryKey: ["salary-advances"], queryFn: fetchSalaryAdvances });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const advances = advancesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createSalaryAdvance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-advances"] });
      setOpen(false);
      setFormError(null);
    },
    onError: () => setFormError("Failed to submit salary advance request."),
  });

  const approveMutation = useMutation({
    mutationFn: approveSalaryAdvance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salary-advances"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectSalaryAdvance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salary-advances"] }),
  });

  const repayMutation = useMutation({
    mutationFn: (id: number) => markSalaryAdvanceRepaid(id, new Date().toISOString().slice(0, 10)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salary-advances"] }),
  });

  const filteredAdvances = useMemo(() => {
    const q = query.trim().toLowerCase();
    return advances.filter((advance) => {
      const matchesQuery =
        !q ||
        advance.employee_name.toLowerCase().includes(q) ||
        advance.reason.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || advance.statut === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [advances, query, statusFilter]);

  function addAdvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const employee = Number(formData.get("employee"));
    const amount = String(formData.get("amount") ?? "");
    const requestDate = String(formData.get("requestDate") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();

    if (!employee || !amount || !requestDate) {
      setFormError("Employee, amount, and request date are required.");
      return;
    }

    createMutation.mutate({ employee, amount, request_date: requestDate, reason });
  }

  const isLoading = advancesQuery.isLoading || employeesQuery.isLoading;
  const loadError = advancesQuery.error || employeesQuery.error;

  return (
    <AppShell
      title="Salary Advances"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Advance
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addAdvance} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Request salary advance</DialogTitle>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required />
                <Input name="requestDate" type="date" required />
              </div>

              <Input name="reason" placeholder="Reason (optional)" />

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
                placeholder="Search salary advance..."
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
              <Loader2 className="h-4 w-4 animate-spin" /> Loading salary advances...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load salary advances. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Request Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Repaid</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredAdvances.map((advance) => (
                    <TableRow key={advance.id}>
                      <TableCell className="font-medium">{advance.employee_name}</TableCell>
                      <TableCell>{formatAmount(advance.amount)}</TableCell>
                      <TableCell>{advance.request_date}</TableCell>
                      <TableCell>{advance.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusClass(advance.statut)}>{advance.statut}</Badge>
                      </TableCell>
                      <TableCell>
                        {advance.statut === "Remboursée"
                          ? `${formatAmount(advance.amount_repaid)} (${advance.repayment_date ?? "—"})`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {advance.statut === "En attente" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate(advance.id)}
                                aria-label="Approve advance"
                              >
                                <Check className="h-4 w-4 text-success" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={rejectMutation.isPending}
                                onClick={() => rejectMutation.mutate(advance.id)}
                                aria-label="Reject advance"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {advance.statut === "Approuvée" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={repayMutation.isPending}
                              onClick={() => repayMutation.mutate(advance.id)}
                              aria-label="Mark repaid"
                            >
                              <Wallet className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredAdvances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No salary advances found.
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