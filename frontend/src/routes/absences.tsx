import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock3,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/absences")({
  component: AbsencesPage,
});

type Absence = {
  id: number;
  employe: string;
  date: string;
  motif: string;
  createdAt: string;
};

type HistoryEntry = {
  id: number;
  action: "registered" | "deleted";
  absence: Absence;
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

const initialAbsences: Absence[] = [
  {
    id: 1,
    employe: "Amina Ben Ali",
    date: "2026-07-11",
    motif: "Rendez-vous médical",
    createdAt: "2026-07-11T08:30:00.000Z",
  },
  {
    id: 2,
    employe: "Karim Haddad",
    date: "2026-07-08",
    motif: "Absence justifiée",
    createdAt: "2026-07-08T09:00:00.000Z",
  },
];

function AbsencesPage() {
  const [absences, setAbsences] = useState(initialAbsences);
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: 101,
      action: "registered",
      absence: initialAbsences[0],
      timestamp: initialAbsences[0].createdAt,
    },
    {
      id: 102,
      action: "registered",
      absence: initialAbsences[1],
      timestamp: initialAbsences[1].createdAt,
    },
  ]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

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
        absence.employe.toLowerCase().includes(q) ||
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

    const formData = new FormData(event.currentTarget);
    const now = new Date().toISOString();

    const absence: Absence = {
      id: Date.now(),
      employe: String(formData.get("employe") ?? "").trim(),
      date: String(formData.get("date") ?? ""),
      motif: String(formData.get("motif") ?? "").trim(),
      createdAt: now,
    };

    if (!absence.employe || !absence.date || !absence.motif) return;

    setAbsences((current) => [absence, ...current]);
    setHistory((current) => [
      { id: Date.now() + 1, action: "registered", absence, timestamp: now },
      ...current,
    ]);
    setOpen(false);
    event.currentTarget.reset();
  }

  function deleteAbsence(id: number) {
    const removedAbsence = absences.find((absence) => absence.id === id);

    if (!removedAbsence) return;

    const now = new Date().toISOString();

    setAbsences((current) => current.filter((absence) => absence.id !== id));
    setHistory((current) => [
      { id: Date.now() + 2, action: "deleted", absence: removedAbsence, timestamp: now },
      ...current,
    ]);
  }

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

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="employe">Employee name</Label>
                  <Input id="employe" name="employe" placeholder="e.g. Amina Ben Ali" required />
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
                <Button type="submit">Register</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-4">
        {/* Stat summary row */}
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
                <p className="text-xs text-muted-foreground">Deleted locally</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content: table + history side by side on larger screens */}
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
                              {initials(absence.employe)}
                            </div>
                            {absence.employe}
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
                            onClick={() => deleteAbsence(absence.id)}
                            aria-label={`Delete absence for ${absence.employe}`}
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
                <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
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
                    <p className="mt-2 text-sm font-medium">{entry.absence.employe}</p>
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