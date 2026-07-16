import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { notificationsList, getUnreadCount } from "@/lib/notifications";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unreadCount = getUnreadCount();

  const handleViewAll = () => {
    navigate({ to: "/notifications" });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Badge className="bg-primary text-primary-foreground border-0">{unreadCount}</Badge>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notificationsList.length > 0 ? (
            <div className="divide-y">
              {notificationsList.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                    notification.unread ? "bg-primary/5" : ""
                  }`}
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${notification.color}`}>
                    <notification.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{notification.title}</p>
                      {notification.unread && (
                        <Badge className="bg-primary text-primary-foreground border-0 h-4 px-1.5 text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">No notifications</p>
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-3">
          <Button variant="outline" className="w-full text-xs" onClick={handleViewAll}>
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
