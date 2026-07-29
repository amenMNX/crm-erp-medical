import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { fetchEmployees } from "@/lib/employees-api";
import {
  createShift,
  deleteShift,
  fetchShifts,
  updateShift,
  type ShiftStatus,
} from "@/lib/shifts-api";

export const Route = createFileRoute("/team-schedule")({
  component: TeamSchedulePage,
});

const statuses: ShiftStatus[] = ["planned", "confirmed", "cancelled"];

function statusLabel(status: ShiftStatus) {
  if (status === "planned") return "Planned";
  if (status === "confirmed") return "Confirmed";
  return "Cancelled";
}

function toInputDateTime(value: Date) {
  return value.toISOString().slice(0, 16);
}

function TeamSchedulePage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const shiftsQuery = useQuery({ queryKey: ["shifts"], queryFn: fetchShifts });
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });

  const shifts = shiftsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ShiftStatus }) =>
      updateShift(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteShift,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shifts;

    return shifts.filter((shift) =>
      [
        shift.employee_name,
        shift.title,
        shift.location,
        shift.status,
        shift.notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, shifts]);

  function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const employee = Number(formData.get("employee"));
    const title = String(formData.get("title") ?? "").trim();
    const start = String(formData.get("start_datetime") ?? "");
    const end = String(formData.get("end_datetime") ?? "");
    const location = String(formData.get("location") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!employee || !title || !start || !end) return;

    createMutation.mutate({
      employee,
      title,
      start_datetime: new Date(start).toISOString(),
      end_datetime: new Date(end).toISOString(),
      location,
      status: "planned",
      notes,
    });
  }

  const isLoading = shiftsQuery.isLoading || employeesQuery.isLoading;
  const loadError = shiftsQuery.error || employeesQuery.error;

  return (
    <AppShell
      title="Team Schedule"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addShift} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Create shift</DialogTitle>
              </DialogHeader>

              <Select name="employee" required>
                <SelectTrigger>
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.first_name} {employee.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input name="title" placeholder="Morning shift" required />

              <Input
                name="start_datetime"
                type="datetime-local"
                defaultValue={toInputDateTime(new Date())}
                required
              />

              <Input
                name="end_datetime"
                type="datetime-local"
                required
              />

              <Input name="location" placeholder="Reception, Room A..." />

              <Textarea name="notes" placeholder="Notes" />

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
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search planning..."
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team schedule...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load team schedule.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="space-y-3">
              {filtered.map((shift) => (
                <div
                  key={shift.id}
                  className="flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <p className="font-medium">{shift.title}</p>
                      <Badge variant="secondary">{statusLabel(shift.status)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {shift.employee_name} · {new Date(shift.start_datetime).toLocaleString()} →{" "}
                      {new Date(shift.end_datetime).toLocaleString()}
                    </p>
                    {shift.location && (
                      <p className="text-sm text-muted-foreground">{shift.location}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={shift.status}
                      onValueChange={(value) =>
                        updateMutation.mutate({ id: shift.id, status: value as ShiftStatus })
                      }
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {statusLabel(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(shift.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                  No shifts found.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}