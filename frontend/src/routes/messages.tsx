import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Search, Paperclip, Smile } from "lucide-react";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Base" },
      { name: "description", content: "Chat with your team and customers." },
    ],
  }),
  component: MessagesPage,
});

const conversations = [
  { id: 1, name: "Ann Vetrov", last: "Sounds good — will send the file", time: "2m", unread: 2, initials: "AV", online: true },
  { id: 2, name: "Design Team", last: "Marina: new mockups are in", time: "12m", unread: 0, initials: "DT", online: true },
  { id: 3, name: "Riko Hakim", last: "Thanks!", time: "1h", unread: 0, initials: "RH", online: false },
  { id: 4, name: "Sofia Martins", last: "Can we reschedule the demo?", time: "3h", unread: 1, initials: "SM", online: false },
  { id: 5, name: "Casey Turner", last: "Invoice paid ✅", time: "yesterday", unread: 0, initials: "CT", online: true },
];

const thread = [
  { from: "them", text: "Hey! Did you get the latest designs?", time: "10:12" },
  { from: "me", text: "Yes, just reviewing them now. Loving the new hero.", time: "10:14" },
  { from: "them", text: "Awesome. I'll push the update to the invoice screen next.", time: "10:15" },
  { from: "me", text: "Perfect. Can you also check the mobile nav?", time: "10:16" },
  { from: "them", text: "Sounds good — will send the file", time: "10:20" },
];

function MessagesPage() {
  const [active, setActive] = useState(conversations[0]);

  return (
    <AppShell title="Messages">
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] h-[calc(100vh-11rem)]">
          <div className="border-r flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search chats..." className="pl-9" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-accent/50 border-b text-left ${active.id === c.id ? "bg-accent/50" : ""}`}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/15 text-primary">{c.initials}</AvatarFallback>
                    </Avatar>
                    {c.online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{c.name}</p>
                      <span className="text-xs text-muted-foreground">{c.time}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{c.last}</p>
                      {c.unread > 0 && (
                        <span className="h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <div className="h-16 border-b flex items-center gap-3 px-4">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/15 text-primary">{active.initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{active.name}</p>
                <p className="text-xs text-muted-foreground">{active.online ? "Online" : "Offline"}</p>
              </div>
            </div>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {thread.map((m, i) => (
                <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${m.from === "me" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{m.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>

            <div className="border-t p-3 flex items-center gap-2">
              <Button variant="ghost" size="icon"><Paperclip className="h-4 w-4" /></Button>
              <Input placeholder="Type a message..." className="flex-1" />
              <Button variant="ghost" size="icon"><Smile className="h-4 w-4" /></Button>
              <Button size="icon"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
