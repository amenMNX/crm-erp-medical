import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchAppointments, createAppointment } from "@/lib/appointments-api";
import { fetchAllPatients } from "@/lib/patients-api";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Base" },
      { name: "description", content: "Your weekly schedule and appointments." },
    ],
  }),
  component: SchedulePage,
});

const hours = ["9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-primary/15 text-primary border-primary/30",
  confirmed: "bg-info/15 text-info border-info/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  done: "bg-success/15 text-success border-success/30",
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function SchedulePage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: fmtDate(new Date()), time: "09:00", patient: "", reason: "" });

  const appointmentsQuery = useQuery({ queryKey: ["appointments"], queryFn: fetchAppointments });
  const patientsQuery = useQuery({ queryKey: ["patients-all"], queryFn: fetchAllPatients });
  const patients = patientsQuery.data ?? [];

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(
    () => days.map((label, i) => ({ label, date: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i) })),
    [weekStart],
  );

  const eventsByDay = useMemo(() => {
    const map: Record<string, { id: number; title: string; time: string; color: string }[]> = {};
    for (const wd of weekDays) map[wd.label] = [];
    for (const a of appointmentsQuery.data ?? []) {
      const d = new Date(a.appointment_date);
      const wd = weekDays.find((w) => fmtDate(w.date) === fmtDate(d));
      if (!wd) continue;
      map[wd.label].push({
        id: a.id,
        title: a.title,
        time: d.toTimeString().slice(0, 5),
        color: STATUS_COLOR[a.status] ?? "bg-muted text-muted-foreground border-border",
      });
    }
    return map;
  }, [appointmentsQuery.data, weekDays]);

  const createMutation = useMutation({
    mutationFn: () =>
      createAppointment({
        patient: Number(form.patient),
        title: form.title,
        appointment_date: new Date(`${form.date}T${form.time}:00`).toISOString(),
        reason: form.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment created", { description: form.title });
      setOpen(false);
      setForm({ title: "", date: fmtDate(new Date()), time: "09:00", patient: "", reason: "" });
    },
    onError: () => toast.error("Couldn't create the appointment"),
  });

  const createAppt = () => {
    if (!form.title) return toast.error("Title is required");
    if (!form.patient) return toast.error("Patient is required");
    createMutation.mutate();
  };

  return (
    <AppShell
      title="Schedule"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New Appointment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Appointment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="stitle">Title</Label>
                <Input id="stitle" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Follow-up consultation" />
              </div>
              <div>
                <Label>Patient</Label>
                <Select value={form.patient} onValueChange={(v) => setForm({ ...form, patient: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sdate">Date</Label>
                  <Input id="sdate" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="stime">Time</Label>
                  <Input id="stime" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={createAppt} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {appointmentsQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule...
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 overflow-auto">
              <div className="grid grid-cols-[80px_repeat(5,minmax(160px,1fr))] gap-2 min-w-[900px]">
                <div />
                {weekDays.map((d) => (
                  <div key={d.label} className="text-center py-2">
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="text-lg font-semibold">{d.date.getDate()}</p>
                  </div>
                ))}
                {hours.map((h) => (
                  <Fragment key={h}>
                    <div className="text-xs text-muted-foreground text-right pr-2 py-4">
                      {h}
                    </div>
                    {weekDays.map((d) => {
                      const ev = eventsByDay[d.label]?.find((e) => e.time.startsWith(h.split(":")[0].padStart(2, "0")));
                      return (
                        <div key={d.label + h} className="border border-dashed rounded-md min-h-[60px] p-1">
                          {ev && (
                            <div className={`text-xs rounded p-2 border ${ev.color}`}>
                              <p className="font-medium truncate">{ev.title}</p>
                              <p className="opacity-70">{ev.time}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 mt-4 md:grid-cols-3">
            {weekDays.slice(0, 3).map((d) => (
              <Card key={d.label}>
                <CardContent className="p-4">
                  <p className="font-semibold mb-2">{d.label}</p>
                  <div className="space-y-2">
                    {(eventsByDay[d.label] ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No appointments.</p>
                    )}
                    {(eventsByDay[d.label] ?? []).map((e) => (
                      <div key={e.id} className="flex items-center justify-between">
                        <span className="text-sm">{e.title}</span>
                        <Badge variant="outline">{e.time}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}