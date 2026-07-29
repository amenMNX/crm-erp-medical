import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ApiNotification,
  type NotificationLevel,
} from "@/lib/notifications-api";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Base" },
      { name: "description", content: "All your activity in one place." },
    ],
  }),
  component: NotificationsPage,
});

const LEVEL_ICON: Record<NotificationLevel, typeof Bell> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const LEVEL_COLOR: Record<NotificationLevel, string> = {
  info: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  error: "bg-destructive/15 text-destructive",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function NotificationsPage() {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const notifications = notificationsQuery.data ?? [];

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (n: ApiNotification) => markNotificationRead(n.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <AppShell
      title="Notifications"
      actions={
        <Button variant="outline" onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>
          {markAllMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Mark all as read
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          {notificationsQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications...
            </div>
          )}

          {!notificationsQuery.isLoading && notifications.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}

          {notifications.map((n) => {
            const Icon = LEVEL_ICON[n.level];
            return (
              <button
                key={n.id}
                onClick={() => !n.is_read && markOneMutation.mutate(n)}
                className={`flex w-full items-start gap-3 p-4 border-b last:border-0 text-left ${!n.is_read ? "bg-primary/5" : ""}`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${LEVEL_COLOR[n.level]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{n.title}</p>
                    {!n.is_read && (
                      <Badge className="bg-primary text-primary-foreground border-0 h-5">New</Badge>
                    )}
                  </div>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}
