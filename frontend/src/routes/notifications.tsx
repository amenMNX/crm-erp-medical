import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notificationsList } from "@/lib/notifications";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Base" },
      { name: "description", content: "All your activity in one place." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <AppShell
      title="Notifications"
      actions={<Button variant="outline">Mark all as read</Button>}
    >
      <Card>
        <CardContent className="p-0">
          {notificationsList.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 border-b last:border-0 ${
                n.unread ? "bg-primary/5" : ""
              }`}
            >
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${n.color}`}
              >
                <n.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{n.title}</p>
                  {n.unread && (
                    <Badge className="bg-primary text-primary-foreground border-0 h-5">
                      New
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{n.desc}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}
