import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Flag, Gift, Loader2, MapPin, Plus, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createSocialEvent,
  fetchSocialEvents,
  registerForEvent,
  unregisterFromEvent,
  type ApiSocialEvent,
  type EventType,
  type SocialEventPayload,
} from "@/lib/social-events-api";
import { fetchEmployees } from "@/lib/employees-api";
import { getAuthUser } from "@/lib/auth";
import { getUpcomingBirthdays } from "@/lib/employee-birthdays";
import { getUpcomingHolidays } from "@/lib/tunisia-holidays";

export const Route = createFileRoute("/social-events")({
  head: () => ({ meta: [{ title: "Événements sociaux" }] }),
  component: SocialEventsPage,
});

const EVENT_COLORS: Record<string, string> = {
  team_building: "bg-purple-100 text-purple-700 border-0",
  anniversary:   "bg-pink-100 text-pink-700 border-0",
  marriage:      "bg-red-100 text-red-700 border-0",
  birth:         "bg-blue-100 text-blue-700 border-0",
  bac_success:   "bg-green-100 text-green-700 border-0",
  promotion:     "bg-yellow-100 text-yellow-700 border-0",
};
const STATUS_COLORS: Record<string, string> = {
  planned:   "bg-blue-100 text-blue-700 border-0",
  ongoing:   "bg-green-100 text-green-700 border-0",
  completed: "bg-muted text-muted-foreground border-0",
  cancelled: "bg-destructive/15 text-destructive border-0",
};
const ec = (t: string) => EVENT_COLORS[t]  ?? "bg-muted text-muted-foreground border-0";
const sc = (s: string) => STATUS_COLORS[s] ?? "bg-muted text-muted-foreground border-0";

const EVENT_TYPES: [string, string][] = [
  ["team_building","Team Building"],["anniversary","Anniversaire"],["marriage","Mariage"],
  ["birth","Naissance"],["circumcision","Circoncision"],["bac_success","Réussite Bac"],
  ["promotion","Promotion"],["retirement","Départ retraite"],["holiday","Fête"],["other","Autre"],
];

function daysUntilLabel(n: number) {
  if (n === 0) return "Aujourd'hui 🎉";
  if (n === 1) return "Demain";
  return `Dans ${n} jours`;
}

function SocialEventsPage() {
  const qc = useQueryClient();
  const user = getAuthUser();
  const isHr = user?.role === "hr" || user?.role === "admin" || user?.is_super_admin;

  const eventsQuery    = useQuery({ queryKey: ["social-events"],  queryFn: fetchSocialEvents });
  // Reuse the employees cache — no new API call if already fetched elsewhere
  const employeesQuery = useQuery({ queryKey: ["employees"],      queryFn: fetchEmployees });

  const [open,   setOpen]   = useState(false);
  const [detail, setDetail] = useState<ApiSocialEvent | null>(null);
  const [form,   setForm]   = useState<SocialEventPayload>({
    title: "", event_type: "team_building", description: "", event_date: "",
    start_time: "", end_time: "", location: "", budget: 0, max_participants: 0, status: "planned",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["social-events"] });

  const createMutation = useMutation({
    mutationFn: createSocialEvent,
    onSuccess: () => { invalidate(); setOpen(false); toast.success("Événement créé."); },
    onError:   () => toast.error("Erreur."),
  });
  const registerMutation = useMutation({
    mutationFn: ({ id, registered }: { id: number; registered: boolean }) =>
      registered ? unregisterFromEvent(id) : registerForEvent(id),
    onSuccess: () => { invalidate(); toast.success("Inscription mise à jour."); },
    onError:   () => toast.error("Erreur."),
  });

  const events   = eventsQuery.data    ?? [];
  const upcoming = events.filter((e) => e.status === "planned" || e.status === "ongoing");

  // ── Birthdays — derived from employees, no extra fetch ───────────────────
  const birthdays = useMemo(
    () => getUpcomingBirthdays(employeesQuery.data ?? [], 60),
    [employeesQuery.data],
  );

  // ── Tunisian holidays — computed once, no fetch needed ───────────────────
  const tunisianHolidays = useMemo(() => getUpcomingHolidays(90), []);

  // ── Event list component ─────────────────────────────────────────────────
  const EventList = ({ list }: { list: ApiSocialEvent[] }) => (
    <div className="space-y-3">
      {list.map((ev) => {
        const registered = ev.participants.includes(user?.id ?? -1);
        return (
          <Card key={ev.id}>
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-base">{ev.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge className={ec(ev.event_type)}>{ev.event_type_display}</Badge>
                  <Badge className={sc(ev.status)}>{ev.status_display}</Badge>
                  <span className="text-xs text-muted-foreground">{ev.event_date}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  {ev.participant_count}{ev.max_participants > 0 ? `/${ev.max_participants}` : ""}
                </span>
                {ev.status === "planned" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={registerMutation.isPending || (ev.is_full && !registered)}
                    onClick={() => registerMutation.mutate({ id: ev.id, registered })}
                  >
                    {registered
                      ? <><UserMinus className="h-3 w-3 mr-1" />Se désinscrire</>
                      : <><UserPlus  className="h-3 w-3 mr-1" />S'inscrire</>}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetail(ev)}>Voir</Button>
              </div>
            </CardHeader>
            {(ev.description || ev.location) && (
              <CardContent className="pt-0 space-y-1">
                {ev.description && <p className="text-sm text-muted-foreground line-clamp-2">{ev.description}</p>}
                {ev.location    && <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{ev.location}</div>}
              </CardContent>
            )}
          </Card>
        );
      })}
      {list.length === 0 && (
        <p className="text-center py-8 text-sm text-muted-foreground">Aucun événement.</p>
      )}
    </div>
  );

  return (
    <AppShell
      title="Événements sociaux"
      actions={
        isHr ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" />Nouvel événement</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Créer un événement</DialogTitle></DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
                className="space-y-3"
              >
                <div><Label>Titre *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v as EventType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EVENT_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Description</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date *</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required /></div>
                  <div><Label>Lieu</Label><Input value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Heure début</Label><Input type="time" value={form.start_time ?? ""} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                  <div><Label>Heure fin</Label><Input type="time" value={form.end_time ?? ""} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Budget (TND)</Label><Input type="number" step="0.01" min="0" value={form.budget ?? 0} onChange={(e) => setForm({ ...form, budget: parseFloat(e.target.value) })} /></div>
                  <div><Label>Max participants (0=∞)</Label><Input type="number" min="0" value={form.max_participants ?? 0} onChange={(e) => setForm({ ...form, max_participants: parseInt(e.target.value) })} /></div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Création..." : "Créer"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            <Calendar className="h-4 w-4 mr-1" />À venir ({upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="all">Tous ({events.length})</TabsTrigger>
          <TabsTrigger value="birthdays">
            <Gift className="h-4 w-4 mr-1" />Anniversaires ({birthdays.length})
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <Flag className="h-4 w-4 mr-1" />Jours fériés ({tunisianHolidays.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Upcoming events ── */}
        <TabsContent value="upcoming" className="mt-3">
          {eventsQuery.isLoading
            ? <LoadingRow />
            : <EventList list={upcoming} />}
        </TabsContent>

        {/* ── All events ── */}
        <TabsContent value="all" className="mt-3">
          {eventsQuery.isLoading
            ? <LoadingRow />
            : <EventList list={events} />}
        </TabsContent>

        {/* ── Birthdays (next 60 days, active employees) ── */}
        <TabsContent value="birthdays" className="space-y-3 mt-3">
          {employeesQuery.isLoading && <LoadingRow />}
          {!employeesQuery.isLoading && birthdays.length === 0 && (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Aucun anniversaire dans les 60 prochains jours.
            </p>
          )}
          {birthdays.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1">
                  <p className="font-medium">{b.name}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-pink-100 text-pink-700 border-0">
                      🎂 {b.age_turning} ans
                    </Badge>
                    {b.department && (
                      <span className="text-xs text-muted-foreground">{b.department}</span>
                    )}
                    {b.job_title && (
                      <span className="text-xs text-muted-foreground">· {b.job_title}</span>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm flex-shrink-0 ml-4">
                  <p className="font-medium">{new Date(b.next_birthday).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>
                  <p className={`text-xs mt-0.5 ${b.days_until === 0 ? "text-pink-600 font-semibold" : "text-muted-foreground"}`}>
                    {daysUntilLabel(b.days_until)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Tunisian public holidays (next 90 days) ── */}
        <TabsContent value="holidays" className="space-y-3 mt-3">
          {tunisianHolidays.length === 0 && (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Aucun jour férié dans les 90 prochains jours.
            </p>
          )}
          {tunisianHolidays.map((h) => {
            const d = new Date(h.date);
            const daysUntil = Math.round((d.getTime() - new Date().setHours(0,0,0,0)) / 86_400_000);
            return (
              <Card key={`${h.date}-${h.name}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{h.emoji}</span>
                    <div>
                      <p className="font-medium">{h.name}</p>
                      <Badge
                        className={
                          h.type === "national"
                            ? "bg-blue-100 text-blue-700 border-0 mt-1"
                            : "bg-green-100 text-green-700 border-0 mt-1"
                        }
                      >
                        {h.type === "national" ? "Fête nationale" : "Fête islamique"}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right text-sm flex-shrink-0 ml-4">
                    <p className="font-medium">
                      {d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <p className={`text-xs mt-0.5 ${daysUntil === 0 ? "text-blue-600 font-semibold" : "text-muted-foreground"}`}>
                      {daysUntilLabel(daysUntil)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-xs text-center text-muted-foreground pt-2">
            Dates des fêtes islamiques calculées à titre indicatif — peuvent varier d'un jour selon l'observation de la lune.
          </p>
        </TabsContent>
      </Tabs>

      {/* ── Event detail dialog ── */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.title}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge className={ec(detail.event_type)}>{detail.event_type_display}</Badge>
                <Badge className={sc(detail.status)}>{detail.status_display}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>📅 {detail.event_date}</div>
                {detail.location   && <div>📍 {detail.location}</div>}
                {detail.start_time && <div>🕐 {detail.start_time}{detail.end_time ? ` — ${detail.end_time}` : ""}</div>}
                <div><Users className="h-3 w-3 inline mr-1" />{detail.participant_count}{detail.max_participants > 0 ? `/${detail.max_participants}` : ""}</div>
                {Number(detail.budget) > 0 && <div>💰 {detail.budget} TND</div>}
              </div>
              {detail.description && (
                <p className="text-muted-foreground whitespace-pre-wrap">{detail.description}</p>
              )}
              {detail.participants_list.length > 0 && (
                <div>
                  <p className="font-medium mb-2">Participants</p>
                  <div className="flex flex-wrap gap-1">
                    {detail.participants_list.map((n, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{n}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />Chargement...
    </div>
  );
}