import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  portalMessages,
  portalSendMessage,
  type PortalMessage,
} from "@/lib/patient-portal-api";
import { Send, MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
 
export const Route = createFileRoute("/patient-portal/messages")({
  component: MessagesPage,
});
 
function MessagesPage() {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
 
  useEffect(() => {
    portalMessages()
      .then(setMessages)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
 
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
 
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setError("");
    try {
      const msg = await portalSendMessage(subject, content);
      setMessages((prev) => [msg, ...prev]);
      setSubject("");
      setContent("");
      setSuccess("Message envoyé. L'équipe vous répondra sous 48h.");
      setTimeout(() => setSuccess(""), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur d'envoi.");
    } finally {
      setSending(false);
    }
  }
 
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
 
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Messagerie sécurisée
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Échangez directement avec votre équipe soignante. Vos messages sont chiffrés.
        </p>
      </div>
 
      {/* Thread */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="h-[420px] overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Chargement des messages...
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
              <MessageSquare className="h-8 w-8 opacity-30" />
              <p>Aucun message pour l'instant.</p>
              <p className="text-xs">Envoyez votre première question ci-dessous.</p>
            </div>
          ) : (
            sorted.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
 
        {/* Compose */}
        <div className="border-t p-4 bg-white">
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <Label htmlFor="subject" className="text-xs">Objet (optionnel)</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex : Question sur mon traitement"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="content" className="text-xs">Message *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Rédigez votre message..."
                rows={3}
                className="mt-1 text-sm resize-none"
                required
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {success && (
              <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-2">{success}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={sending || !content.trim()}>
                <Send className="h-4 w-4 mr-2" />
                {sending ? "Envoi..." : "Envoyer"}
              </Button>
            </div>
          </form>
        </div>
      </div>
 
      <p className="text-xs text-gray-400 text-center">
        🔒 Chiffrement TLS · Conservation 5 ans · Réponse sous 48h ouvrées
      </p>
    </div>
  );
}
 
function MessageBubble({ msg }: { msg: PortalMessage }) {
  const isPatient = msg.direction === "patient_to_staff";
  const date = new Date(msg.created_at).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
 
  return (
    <div className={`flex ${isPatient ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
          isPatient
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-white border text-gray-800 rounded-bl-sm shadow-sm"
        }`}
      >
        {msg.subject && (
          <p className={`text-xs font-semibold mb-1 ${isPatient ? "text-white/80" : "text-primary"}`}>
            {msg.subject}
          </p>
        )}
        <p className="leading-relaxed">{msg.content}</p>
        <p className={`text-xs mt-1.5 ${isPatient ? "text-white/60" : "text-gray-400"}`}>
          {isPatient ? "Vous" : msg.sender_name} · {date}
        </p>
      </div>
    </div>
  );
}