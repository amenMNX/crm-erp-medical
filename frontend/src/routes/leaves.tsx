import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Search, X } from "lucide-react";
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

export const Route = createFileRoute("/leaves")({
  component: LeavesPage,
});

type LeaveStatus = "En attente" | "Acceptée" | "Refusée";

type LeaveRequest = {
  id: number;
  employe: string;
  dateDebut: string;
  dateFin: string;
  motif: string;
  statut: LeaveStatus;
};

const statuses: LeaveStatus[] = ["En attente", "Acceptée", "Refusée"];

const initialLeaves: LeaveRequest[] = [
  {
    id: 1,
    employe: "Amina Ben Ali",
    dateDebut: "2026-07-20",
    dateFin: "2026-07-25",
    motif: "Congé annuel",
    statut: "En attente",
  },
  {
    id: 2,
    employe: "Karim Haddad",
    dateDebut: "2026-08-01",
    dateFin: "2026-08-03",
    motif: "Repos médical",
    statut: "Acceptée",
  },
];

function statusClass(status: LeaveStatus) {
  if (status === "Acceptée") return "bg-success/15 text-success border-0";
  if (status === "Refusée") return "bg-destructive/15 text-destructive border-0";
  return "bg-warning/15 text-warning border-0";
}

function LeavesPage() {
  const [leaves, setLeaves] = useState(initialLeaves);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const filteredLeaves = useMemo(() => {
    const q = query.trim().toLowerCase();

    return leaves.filter((leave) => {
      const matchesQuery =
        !q ||
        leave.employe.toLowerCase().includes(q) ||
        leave.motif.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || leave.statut === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [leaves, query, statusFilter]);

  function addLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const leave: LeaveRequest = {
      id: Date.now(),
      employe: String(formData.get("employe") ?? "").trim(),
      dateDebut: String(formData.get("dateDebut") ?? ""),
      dateFin: String(formData.get("dateFin") ?? ""),
      motif: String(formData.get("motif") ?? "").trim(),
      statut: "En attente",
    };

    if (!leave.employe || !leave.dateDebut || !leave.dateFin || !leave.motif) return;

    setLeaves((current) => [leave, ...current]);
    setOpen(false);
    event.currentTarget.reset();
  }

  function updateStatus(id: number, statut: LeaveStatus) {
    setLeaves((current) =>
      current.map((leave) => (leave.id === id ? { ...leave, statut } : leave)),
    );
  }

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

              <Input name="employe" placeholder="Employee name" required />
              <Input name="motif" placeholder="Reason" required />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="dateDebut" type="date" required />
                <Input name="dateFin" type="date" required />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Submit</Button>
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
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                    <TableCell className="font-medium">{leave.employe}</TableCell>
                    <TableCell>{leave.dateDebut}</TableCell>
                    <TableCell>{leave.dateFin}</TableCell>
                    <TableCell>{leave.motif}</TableCell>
                    <TableCell>
                      <Badge className={statusClass(leave.statut)}>{leave.statut}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateStatus(leave.id, "Acceptée")}
                          aria-label="Accept leave"
                        >
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateStatus(leave.id, "Refusée")}
                          aria-label="Reject leave"
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredLeaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No leave requests found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}