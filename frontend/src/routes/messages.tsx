import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Send, Search, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { fetchMessages, sendMessage, markMessageRead, type ApiMessage } from "@/lib/messages-api";
import { fetchCurrentUser } from "@/lib/me-api";
import { fetchUsers } from "@/lib/users-api";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Base" },
      { name: "description", content: "Chat with your team." },
    ],
  }),
  component: MessagesPage,
});

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function MessagesPage() {
  const queryClient = useQueryClient();
  const [activePartnerId, setActivePartnerId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState("");
  const [newBody, setNewBody] = useState("");

  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchCurrentUser });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const messagesQuery = useQuery({ queryKey: ["messages"], queryFn: fetchMessages, refetchInterval: 15000 });

  const me = meQuery.data;
  const users = usersQuery.data ?? [];
  const messages = messagesQuery.data ?? [];

  const conversations = useMemo(() => {
    if (!me) return [];
    const byPartner = new Map<number, ApiMessage[]>();
    for (const m of messages) {
      const partnerId = m.sender === me.id ? m.recipient : m.sender;
      if (!byPartner.has(partnerId)) byPartner.set(partnerId, []);
      byPartner.get(partnerId)!.push(m);
    }
    return Array.from(byPartner.entries())
      .map(([partnerId, msgs]) => {
        const sorted = [...msgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const last = sorted[0];
        const partnerName = last.sender === me.id ? last.recipient_name : last.sender_name;
        const unread = msgs.filter((m) => m.recipient === me.id && !m.is_read).length;
        return { partnerId, partnerName, last, unread, msgs: [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) };
      })
      .filter((c) => c.partnerName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime());
  }, [messages, me, search]);

  const activeConversation = conversations.find((c) => c.partnerId === activePartnerId) ?? conversations[0] ?? null;

  const sendMutation = useMutation({
    mutationFn: ({ recipient, body }: { recipient: number; body: string }) => sendMessage(recipient, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      setDraft("");
    },
    onError: () => toast.error("Couldn't send the message"),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markMessageRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
  });

  function openConversation(partnerId: number) {
    setActivePartnerId(partnerId);
    const conv = conversations.find((c) => c.partnerId === partnerId);
    conv?.msgs.filter((m) => m.recipient === me?.id && !m.is_read).forEach((m) => markReadMutation.mutate(m.id));
  }

  function handleSend() {
    if (!activeConversation || !draft.trim()) return;
    sendMutation.mutate({ recipient: activeConversation.partnerId, body: draft.trim() });
  }

  function handleStartConversation() {
    if (!newRecipient || !newBody.trim()) {
      toast.error("Pick a recipient and write a message");
      return;
    }
    sendMutation.mutate(
      { recipient: Number(newRecipient), body: newBody.trim() },
      {
        onSuccess: () => {
          setActivePartnerId(Number(newRecipient));
          setNewOpen(false);
          setNewBody("");
          setNewRecipient("");
        },
      },
    );
  }

  const isLoading = meQuery.isLoading || messagesQuery.isLoading;

  return (
    <AppShell
      title="Messages"
      actions={
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New Message
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={newRecipient} onValueChange={setNewRecipient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a colleague" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter((u) => u.id !== me?.id).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {`${u.first_name} ${u.last_name}`.trim() || u.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Type a message..." value={newBody} onChange={(e) => setNewBody(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={handleStartConversation} disabled={sendMutation.isPending}>
                {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] h-[calc(100vh-11rem)]">
          <div className="border-r flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search chats..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                </div>
              )}
              {!isLoading && conversations.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No conversations yet. Start one above.</p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.partnerId}
                  onClick={() => openConversation(c.partnerId)}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-accent/50 border-b text-left ${activeConversation?.partnerId === c.partnerId ? "bg-accent/50" : ""}`}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/15 text-primary">{initials(c.partnerName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{c.partnerName}</p>
                      <span className="text-xs text-muted-foreground">{new Date(c.last.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">{c.last.body}</p>
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
            {activeConversation ? (
              <>
                <div className="h-16 border-b flex items-center gap-3 px-4">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/15 text-primary">{initials(activeConversation.partnerName)}</AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{activeConversation.partnerName}</p>
                </div>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                  {activeConversation.msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.sender === me?.id ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${m.sender === me?.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <p>{m.body}</p>
                        <p className={`text-[10px] mt-1 ${m.sender === me?.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>

                <div className="border-t p-3 flex items-center gap-2">
                  <Input
                    placeholder="Type a message..."
                    className="flex-1"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <Button size="icon" onClick={handleSend} disabled={sendMutation.isPending}>
                    {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              !isLoading && (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Select or start a conversation.
                </div>
              )
            )}
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
