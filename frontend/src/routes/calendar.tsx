import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Base" },
      { name: "description", content: "View your schedule by day, month, or year and create events." },
    ],
  }),
  component: CalendarPage,
});

type View = "day" | "month" | "year";

interface Event {
  id: number;
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  color: string;
}

const seedEvents: Event[] = [
  { id: 1, date: "2024-12-04", time: "09:00", title: "Client Call — Nika", color: "bg-primary/20 text-primary" },
  { id: 2, date: "2024-12-04", time: "13:00", title: "Design Review", color: "bg-info/20 text-info" },
  { id: 3, date: "2024-12-11", time: "10:30", title: "Sprint Planning", color: "bg-warning/20 text-warning" },
  { id: 4, date: "2024-12-18", time: "15:00", title: "Product Launch", color: "bg-success/20 text-success" },
  { id: 5, date: "2024-12-21", time: "18:00", title: "Team Dinner", color: "bg-destructive/20 text-destructive" },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date(2024, 11, 1));
  const [events, setEvents] = useState<Event[]>(seedEvents);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", date: fmt(new Date()), time: "09:00", notes: "" });

  const navigatePrev = () => {
    const d = new Date(cursor);
    if (view === "year") d.setFullYear(d.getFullYear() - 1);
    else if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 1);
    setCursor(d);
  };
  const navigateNext = () => {
    const d = new Date(cursor);
    if (view === "year") d.setFullYear(d.getFullYear() + 1);
    else if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
    setCursor(d);
  };

  const createEvent = () => {
    if (!form.title) {
      toast.error("Title is required");
      return;
    }
    const colors = ["bg-primary/20 text-primary", "bg-info/20 text-info", "bg-warning/20 text-warning", "bg-success/20 text-success"];
    setEvents((e) => [...e, {
      id: Date.now(),
      date: form.date,
      time: form.time,
      title: form.title,
      color: colors[e.length % colors.length],
    }]);
    toast.success("Event created", { description: form.title });
    setOpen(false);
    setForm({ title: "", date: fmt(new Date()), time: "09:00", notes: "" });
  };

  const label = view === "year"
    ? cursor.getFullYear()
    : view === "month"
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <AppShell
      title="Calendar"
      actions={
        <>
          <div className="flex rounded-lg border bg-background p-0.5">
            {(["day", "month", "year"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-sm rounded-md capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Create Event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create an Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Meeting with client" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="edate">Date</Label>
                    <Input id="edate" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="etime">Time</Label>
                    <Input id="etime" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="enotes">Notes</Label>
                  <Textarea id="enotes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={createEvent}>Create Event</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={navigatePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold ml-2">{label}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(2024, 11, 1))}>
              Today
            </Button>
          </div>

          {view === "month" && <MonthView cursor={cursor} events={events} />}
          {view === "year" && <YearView year={cursor.getFullYear()} onPickMonth={(m) => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView("month"); }} />}
          {view === "day" && <DayView cursor={cursor} events={events} />}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function MonthView({ cursor, events }: { cursor: Date; events: Event[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground mb-2">
        {WEEK.map((w) => (
          <div key={w} className="p-2 text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
        {cells.map((c, i) => {
          const key = c ? fmt(c) : `empty-${i}`;
          const dayEvents = c ? events.filter((e) => e.date === fmt(c)) : [];
          const isToday = c && fmt(c) === fmt(new Date());
          return (
            <div key={key} className="bg-background min-h-[110px] p-2 text-sm">
              {c && (
                <>
                  <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-primary text-primary-foreground font-semibold" : ""}`}>
                    {c.getDate()}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map((e) => (
                      <div key={e.id} className={`text-xs rounded px-1.5 py-0.5 truncate ${e.color}`}>
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-muted-foreground">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({ year, onPickMonth }: { year: number; onPickMonth: (m: number) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTHS.map((m, idx) => {
        const daysInMonth = new Date(year, idx + 1, 0).getDate();
        const startOffset = new Date(year, idx, 1).getDay();
        const cells: (number | null)[] = Array(startOffset).fill(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        return (
          <button
            key={m}
            onClick={() => onPickMonth(idx)}
            className="rounded-lg border p-3 text-left hover:border-primary transition-colors"
          >
            <p className="text-sm font-semibold mb-2">{m}</p>
            <div className="grid grid-cols-7 gap-0.5 text-[10px] text-muted-foreground">
              {WEEK.map((w) => <div key={w} className="text-center">{w[0]}</div>)}
              {cells.map((c, i) => (
                <div key={i} className="text-center py-0.5 text-foreground">
                  {c ?? ""}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayView({ cursor, events }: { cursor: Date; events: Event[] }) {
  const dayEvents = events
    .filter((e) => e.date === fmt(cursor))
    .sort((a, b) => a.time.localeCompare(b.time));
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8am–7pm

  return (
    <div className="grid gap-4 md:grid-cols-[80px_1fr]">
      <div className="space-y-6 text-xs text-muted-foreground text-right pr-2">
        {hours.map((h) => (
          <div key={h} className="h-14">{h}:00</div>
        ))}
      </div>
      <div className="border-l relative">
        {hours.map((h) => (
          <div key={h} className="h-14 border-b border-dashed" />
        ))}
        <div className="absolute inset-0 p-2 space-y-2">
          {dayEvents.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No events for this day.</p>
          )}
          {dayEvents.map((e) => (
            <div key={e.id} className={`rounded-lg px-3 py-2 text-sm ${e.color}`}>
              <p className="font-medium">{e.title}</p>
              <p className="text-xs opacity-80">{e.time}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
