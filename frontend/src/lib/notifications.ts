import { Bell, MessageSquare, FileText, User, ShoppingCart, CheckCircle2 } from "lucide-react";

export interface Notification {
  id: string;
  icon: typeof Bell;
  color: string;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
}

export const notificationsList: Notification[] = [
  {
    id: "1",
    icon: FileText,
    color: "bg-primary/15 text-primary",
    title: "New invoice paid",
    desc: "Sofia Martins paid invoice #IN015 — $520.00",
    time: "2m ago",
    unread: true,
  },
  {
    id: "2",
    icon: MessageSquare,
    color: "bg-info/15 text-info",
    title: "New message from Ann",
    desc: "Sounds good — will send the file",
    time: "12m ago",
    unread: true,
  },
  {
    id: "3",
    icon: User,
    color: "bg-success/15 text-success",
    title: "New customer signed up",
    desc: "Marina Lee just joined your workspace",
    time: "1h ago",
    unread: false,
  },
  {
    id: "4",
    icon: ShoppingCart,
    color: "bg-warning/15 text-warning",
    title: "Low stock warning",
    desc: "Kite Camera has only 5 units left in stock",
    time: "3h ago",
    unread: false,
  },
  {
    id: "5",
    icon: CheckCircle2,
    color: "bg-success/15 text-success",
    title: "Task completed",
    desc: "Riko marked \"Password reset flow\" as done",
    time: "yesterday",
    unread: false,
  },
  {
    id: "6",
    icon: Bell,
    color: "bg-primary/15 text-primary",
    title: "Weekly digest",
    desc: "Your Monday summary is ready",
    time: "yesterday",
    unread: false,
  },
];

export function getUnreadCount(): number {
  return notificationsList.filter((n) => n.unread).length;
}
