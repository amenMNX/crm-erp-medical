import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  portalMessages,
  portalSendMessage,
  portalUnreadCount,
  type PortalMessage,
} from "@/lib/patient-portal-api";
import {
  AlertCircle, CheckCheck, ChevronDown, Loader2, Lock,
  MessageSquare, RefreshCw, Send,
} from "lucide-react";

export const Route = createFileRoute("/patient-portal/messages")({
  component: MessagesPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function timeAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

const POLL_INTERVAL = 30_000;
const MAX_CHARS = 2000;

// ─── Page ─────────────────────────────────────────────────────────────────────

function MessagesPage() {
  const [messages, setMessages]     = useState<PortalMessage[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState("");

  const [content, setContent]       = useState("");
  const [subject, setSubject]       = useState("");
  const [showSubject, setShowSubject] = useState(false);
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCountRef = useRef(0);
  const pollerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await portalMessages();
      setMessages(data);
      setError("");
      portalUnreadCount().catch(() => {});
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : "Erreur de chargement.");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  useEffect(() => {
    pollerRef.current = setInterval(() => fetchMessages(true), POLL_INTERVAL);
    return () => { if (pollerRef.current) clearInterval(pollerRef.current); };
  }, [fetchMessages]);

  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  useEffect(() => {
    if (sorted.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = sorted.length;
  }, [sorted.length]);

  // Auto-resize textarea
  function handleContentChange(val: string) {
    if (val.length > MAX_CHARS) return;
    setContent(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const msg = await portalSendMessage(subject.trim() || "Message", content.trim());
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
      setContent("");
      setSubject("");
      setShowSubject(false);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : "Erreur d'envoi. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  const unreadCount = sorted.filter(
    (m) => m.direction === "staff_to_patient" && !m.is_read
  ).length;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4 h-[calc(100vh-7rem)]">

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Messagerie sécurisée
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 px-1.5 text-[11px] font-bold rounded-full bg-primary text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Échangez avec votre équipe soignante · réponse sous 48h ouvrées
          </p>
        </div>
        <button
          onClick={() => fetchMessages()}
          disabled={refreshing}
          title="Rafraîchir"
          className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Thread container */}
      <div className="flex-1 bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden min-h-0">

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-gray-50/50">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Chargement des messages…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />{error}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary/30" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-600">Aucun message pour l'instant</p>
                <p className="text-xs text-gray-400 mt-1">Envoyez votre première question ci-dessous.</p>
              </div>
            </div>
          ) : (
            <>
              {sorted.map((msg, i) => {
                const prev = sorted[i - 1];
                const showDate =
                  !prev ||
                  new Date(msg.created_at).toDateString() !==
                    new Date(prev.created_at).toDateString();
                const prevSameDir = prev && prev.direction === msg.direction && !showDate;
                const nextMsg = sorted[i + 1];
                const isLastInGroup = !nextMsg || nextMsg.direction !== msg.direction;

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-[11px] text-gray-400 font-medium">
                          {formatDateLabel(msg.created_at)}
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                    )}
                    <MessageBubble
                      msg={msg}
                      compact={!!prevSameDir}
                      isLastInGroup={isLastInGroup}
                    />
                  </div>
                );
              })}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-t text-[11px] text-gray-400 bg-white">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Connexion sécurisée · Rafraîchissement auto toutes les 30 s
        </div>

        {/* Compose */}
        <div className="bg-white p-4 border-t shrink-0">
          <form onSubmit={handleSend} className="space-y-2">
            <button
              type="button"
              onClick={() => setShowSubject((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showSubject ? "rotate-180" : ""}`} />
              {showSubject ? "Masquer l'objet" : "Ajouter un objet"}
            </button>

            {showSubject && (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet du message"
                className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            )}

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(e as never);
                }}
                placeholder="Rédigez votre message… (⌘↵ pour envoyer)"
                rows={2}
                style={{ minHeight: "64px", maxHeight: "160px" }}
                className="w-full text-sm px-4 py-3 pr-12 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                required
              />
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="absolute right-2 bottom-2 flex items-center justify-center h-8 w-8 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm"
                title="Envoyer (⌘↵)"
              >
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                {sendError && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{sendError}
                  </p>
                )}
              </div>
              {content.length > 0 && (
                <span className={`text-[11px] tabular-nums ${content.length > MAX_CHARS * 0.9 ? "text-amber-500" : "text-gray-400"}`}>
                  {content.length}/{MAX_CHARS}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1.5 shrink-0">
        <Lock className="h-3 w-3" />
        Chiffrement TLS · Conservation 5 ans réglementaires
      </p>
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  compact,
  isLastInGroup,
}: {
  msg: PortalMessage;
  compact: boolean;
  isLastInGroup: boolean;
}) {
  const isPatient = msg.direction === "patient_to_staff";

  return (
    <div className={`flex ${isPatient ? "justify-end" : "justify-start"} ${compact ? "mt-0.5" : "mt-3"}`}>
      {/* Staff avatar — visible only on last of group */}
      {!isPatient && (
        <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-xs font-semibold mr-2 mt-0.5 transition-opacity ${
          isLastInGroup ? "bg-primary/10 text-primary opacity-100" : "opacity-0"
        }`}>
          {msg.sender_name
            ? msg.sender_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
            : "ST"}
        </div>
      )}

      <div className="max-w-[78%]">
        {/* Sender name — only on first of staff group */}
        {!isPatient && !compact && (
          <p className="text-[11px] text-gray-400 font-medium mb-1 ml-1">
            {msg.sender_name ?? "Équipe soignante"}
          </p>
        )}

        <div className={`rounded-2xl px-4 py-2.5 text-sm ${
          isPatient
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-white border text-gray-800 rounded-bl-sm shadow-sm"
        }`}>
          {/* Subject */}
          {msg.subject && msg.subject !== "Message" && (
            <p className={`text-[11px] font-semibold mb-1 ${isPatient ? "text-white/70" : "text-primary"}`}>
              {msg.subject}
            </p>
          )}

          <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>

          <div className={`flex items-center gap-1.5 mt-1.5 ${isPatient ? "justify-end" : "justify-start"}`}>
            <span
              className={`text-[11px] ${isPatient ? "text-white/50" : "text-gray-400"}`}
              title={timeAbsolute(msg.created_at)}
            >
              {timeAgo(msg.created_at)}
            </span>
            {isPatient && (
              <CheckCheck
                className={`h-3.5 w-3.5 shrink-0 transition-colors ${msg.is_read ? "text-blue-200" : "text-white/30"}`}
                title={msg.is_read ? "Lu par l'équipe" : "Envoyé"}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}