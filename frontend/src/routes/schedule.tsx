import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Base" },
      { name: "description", content: "Your weekly schedule and meetings." },
    ],
  }),
  component: SchedulePage,
});

const hours = ["9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const events: Record<string, { title: string; time: string; color: string }[]> = {
  Mon: [{ title: "Team standup", time: "9:00 - 9:30", color: "bg-primary/15 text-primary border-primary/30" }],
  Tue: [{ title: "Design review", time: "11:00 - 12:00", color: "bg-warning/15 text-warning border-warning/30" }],
  Wed: [
    { title: "1:1 with Ann", time: "10:00 - 10:30", color: "bg-info/15 text-info border-info/30" },
    { title: "Product sync", time: "14:00 - 15:00", color: "bg-success/15 text-success border-success/30" },
  ],
  Thu: [{ title: "Client demo", time: "13:00 - 14:00", color: "bg-primary/15 text-primary border-primary/30" }],
  Fri: [{ title: "Weekly review", time: "16:00 - 17:00", color: "bg-warning/15 text-warning border-warning/30" }],
};

function SchedulePage() {
  return (
    <AppShell
      title="Schedule"
      actions={
        <Button>
          <Plus className="h-4 w-4" /> New Meeting
        </Button>
      }
    >
      <Card>
        <CardContent className="p-4 overflow-auto">
          <div className="grid grid-cols-[80px_repeat(5,minmax(160px,1fr))] gap-2 min-w-[900px]">
            <div />
            {days.map((d) => (
              <div key={d} className="text-center py-2">
                <p className="text-xs text-muted-foreground">{d}</p>
                <p className="text-lg font-semibold">{10 + days.indexOf(d)}</p>
              </div>
            ))}
            {hours.map((h) => (
              <Fragment key={h}>
                <div className="text-xs text-muted-foreground text-right pr-2 py-4">
                  {h}
                </div>
                {days.map((d) => {
                  const ev = events[d]?.find((e) => e.time.startsWith(h));
                  return (
                    <div key={d + h} className="border border-dashed rounded-md min-h-[60px] p-1">
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
        {Object.entries(events).slice(0, 3).map(([day, list]) => (
          <Card key={day}>
            <CardContent className="p-4">
              <p className="font-semibold mb-2">{day}</p>
              <div className="space-y-2">
                {list.map((e) => (
                  <div key={e.title} className="flex items-center justify-between">
                    <span className="text-sm">{e.title}</span>
                    <Badge variant="outline">{e.time}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
