import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
// ✅ FIXED: Import from singular 'absence-api' to match your file name
import {
  createAbsence,
  deleteAbsence,
  fetchAbsences,
  type ApiAbsence,
} from "@/lib/absences-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/absences")({
  component: AbsencesPage,
});

type HistoryEntry = {
  id: number;
  action: "registered" | "deleted";
  absence: ApiAbsence;
  timestamp: string;
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

const isThisWeek = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
};

function AbsencesPage() {
  const queryClient = useQueryClient();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ✅ Fetch real data from API
  const absencesQuery = useQuery({ 
    queryKey: ["absences"], 
    queryFn: fetchAbsences 
  });
  
  const employeesQuery = useQuery({ 
    queryKey: ["employees"], 
    queryFn: fetchEmployees 
  });

  const absences = absencesQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createAbsence,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      setHistory((current) => [
        { 
          id: Date.now(), 
          action: "registered", 
          absence: created, 
          timestamp: new Date().toISOString() 
        },
        ...current,
      ]);
      setOpen(false);
      setFormError(null);
    },
    onError: () => setFormError("Failed to register absence."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAbsence,
    onSuccess: (_void, id) => {
      const removed = absences.find((absence) => absence.id === id);
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      if (removed) {
        setHistory((current) => [
          { 
            id: Date.now(), 
            action: "deleted", 
            absence: removed, 
            timestamp: new Date().toISOString() 
          },
          ...current,
        ]);
      }
    },
  });

  const sortedAbsences = useMemo(
    () =>
      [...absences].sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime(),
      ),
    [absences],
  );

  const filteredAbsences = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortedAbsences.filter((absence) => {
      return (
        !q ||
        absence.employee_name.toLowerCase().includes(q) ||
        absence.motif.toLowerCase().includes(q) ||
        absence.date.includes(q)
      );
    });
  }, [sortedAbsences, query]);

  const recentHistory = useMemo(() => {
    return [...history].sort((left, right) => {
      return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
    });
  }, [history]);

  const deletedCount = history.filter((entry) => entry.action === "deleted").length;
  const thisWeekCount = absences.filter((absence) => isThisWeek(absence.date)).length;

  function addAbsence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const employee = Number(formData.get("employee"));
    const date = String(formData.get("date") ?? "");
    const motif = String(formData.get("motif") ?? "").trim();

    if (!employee || !date || !motif) {
      setFormError("Employee, date, and reason are required.");
      return;
    }

    createMutation.mutate({ employee, date, motif });
  }

  const isLoading = absencesQuery.isLoading || employeesQuery.isLoading;
  const loadError = absencesQuery.error || employeesQuery.error;

  return (
    <AppShell
      title="Absences"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Absence
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addAbsence} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Register absence</DialogTitle>
              </DialogHeader>

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                {/* ✅ Employee Dropdown */}
                <div className="space-y-1.5">
                  <Label htmlFor="employee">Employee</Label>
                  <Select name="employee" required>
                    <SelectTrigger id="employee">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={String(employee.id)}>
                          {employee.first_name} {employee.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" name="date" type="date" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motif">Reason / note</Label>
                  <Textarea id="motif" name="motif" placeholder="Reason / note" required />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Registering..." : "Register"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">{absences.length}</p>
                <p className="text-xs text-muted-foreground">Active absences</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">{thisWeekCount}</p>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Trash2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-semibold leading-none">{deletedCount}</p>
                <p className="text-xs text-muted-foreground">Deleted this session</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Absences</CardTitle>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search absence..."
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-2">
              {/* ✅ Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading absences...
                </div>
              )}

              {/* ✅ Error State */}
              {!isLoading && loadError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  Couldn't load absences. Please refresh the page.
                </div>
              )}

              {/* ✅ Data Table */}
              {!isLoading && !loadError && (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredAbsences.map((absence) => (
                        <TableRow key={absence.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                {initials(absence.employee_name)}
                              </div>
                              {absence.employee_name}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDate(absence.date)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">
                            {absence.motif}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deleteMutation.isPending}
                              onClick={() => deleteMutation.mutate(absence.id)}
                              aria-label={`Delete absence for ${absence.employee_name}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}

                      {filteredAbsences.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-32">
                            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                              <UserRound className="h-6 w-6" />
                              <p className="text-sm">
                                {query ? "No absences match your search." : "No absences recorded yet."}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" /> History
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[520px] space-y-3 overflow-y-auto p-4 pt-0">
              {recentHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet this session.
                </p>
              ) : (
                recentHistory.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={entry.action === "registered" ? "default" : "secondary"}>
                        {entry.action === "registered" ? "Registered" : "Deleted"}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-medium">{entry.absence.employee_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.absence.motif} • {formatDate(entry.absence.date)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}