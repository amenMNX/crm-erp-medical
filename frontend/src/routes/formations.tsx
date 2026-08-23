import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Plus,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createEnrollment,
  createSkill,
  createTrainingSession,
  fetchEmployeeSkills,
  fetchSkills,
  fetchTrainingSessions,
  fetchUpcomingTrainings,
  updateEnrollment,
  type TrainingEnrollment,
  type TrainingSession,
} from "@/lib/formations-api";
import { fetchEmployees } from "@/lib/employees-api";

export const Route = createFileRoute("/formations")({
  head: () => ({
    meta: [{ title: "Formations — Base" }],
  }),
  component: FormationsPage,
});

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  planned:   "bg-blue-100 text-blue-800",
  ongoing:   "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  planned:   "Planifiée",
  ongoing:   "En cours",
  completed: "Terminée",
  cancelled: "Annulée",
};

const CATEGORY_LABELS: Record<string, string> = {
  clinical:   "Clinique",
  technical:  "Technique",
  regulatory: "Réglementaire",
  management: "Management",
  other:      "Autre",
};

const RESULT_LABELS: Record<string, string> = {
  pending: "En attente",
  passed:  "Réussi",
  failed:  "Échoué",
  absent:  "Absent",
};

const RESULT_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  passed:  "bg-green-100 text-green-800",
  failed:  "bg-red-100 text-red-800",
  absent:  "bg-gray-100 text-gray-600",
};

const LEVEL_LABELS: Record<string, string> = {
  beginner:     "Débutant",
  intermediate: "Intermédiaire",
  advanced:     "Avancé",
  expert:       "Expert",
};

// ── Dialog — Nouvelle compétence ──────────────────────────────────────────────

function AddSkillDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "clinical", description: "" });

  const mutation = useMutation({
    mutationFn: createSkill,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      toast.success("Compétence ajoutée au référentiel.");
      setOpen(false);
      setForm({ name: "", category: "clinical", description: "" });
    },
    onError: () => toast.error("Impossible d'ajouter la compétence."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle compétence
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter une compétence au référentiel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Nom de la compétence *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Radioprotection, Dosimétrie clinique…"
            />
          </div>
          <div className="space-y-1">
            <Label>Catégorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="clinical">Clinique</SelectItem>
                <SelectItem value="technical">Technique</SelectItem>
                <SelectItem value="regulatory">Réglementaire / Sécurité</SelectItem>
                <SelectItem value="management">Management</SelectItem>
                <SelectItem value="other">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            disabled={!form.name || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog — Nouvelle session ─────────────────────────────────────────────────

function AddTrainingDialog({ skillOptions }: { skillOptions: Array<{ id: number; name: string }> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", skill: "", description: "", trainer: "", location: "",
    start_date: "", end_date: "", duration_hours: "8", status: "planned",
    max_participants: "0", cost: "0", notes: "",
  });

  const mutation = useMutation({
    mutationFn: createTrainingSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-sessions"] });
      qc.invalidateQueries({ queryKey: ["upcoming-trainings"] });
      toast.success("Session de formation créée.");
      setOpen(false);
    },
    onError: () => toast.error("Impossible de créer la session."),
  });

  const valid = !!form.title && !!form.start_date && !!form.end_date;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Planifier une formation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle session de formation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Titre *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Formation radioprotection 2026…"
            />
          </div>
          <div className="space-y-1">
            <Label>Compétence visée</Label>
            <Select value={form.skill} onValueChange={(v) => setForm((f) => ({ ...f, skill: v }))}>
              <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
              <SelectContent>
                {skillOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date de début *</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Date de fin *</Label>
              <Input
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Formateur / Organisme</Label>
              <Input value={form.trainer} onChange={(e) => setForm((f) => ({ ...f, trainer: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Lieu</Label>
              <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Durée (h)</Label>
              <Input type="number" min="0" step="0.5" value={form.duration_hours} onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Participants max</Label>
              <Input type="number" min="0" value={form.max_participants} onChange={(e) => setForm((f) => ({ ...f, max_participants: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Coût (TND)</Label>
              <Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description / Objectifs</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() =>
              mutation.mutate({
                ...form,
                skill: form.skill ? Number(form.skill) : undefined,
                duration_hours: Number(form.duration_hours),
                max_participants: Number(form.max_participants),
                cost: Number(form.cost),
              })
            }
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer la session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog — Gérer les inscriptions d'une session ────────────────────────────

function EnrollmentDialog({ session }: { session: TrainingSession }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const employeesQ = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees, enabled: open });
  const employees = employeesQ.data ?? [];

  // Employés déjà inscrits
  const enrolledIds = new Set(session.enrollments.map((e) => e.employee));

  const enrollMut = useMutation({
    mutationFn: (employeeId: number) =>
      createEnrollment({ session: session.id, employee: employeeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-sessions"] });
      toast.success("Employé inscrit à la formation.");
      setSelectedEmployee("");
    },
    onError: () => toast.error("Impossible d'inscrire l'employé."),
  });

  const resultMut = useMutation({
    mutationFn: ({ id, result, certificate_issued }: { id: number; result: string; certificate_issued?: boolean }) =>
      updateEnrollment(id, { result: result as TrainingEnrollment["result"], certificate_issued }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-sessions"] });
      toast.success("Résultat mis à jour.");
    },
    onError: () => toast.error("Impossible de mettre à jour le résultat."),
  });

  const availableEmployees = employees.filter((e) => !enrolledIds.has(e.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-3.5 w-3.5 mr-1.5" />
          Inscrits ({session.enrolled_count})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inscriptions — {session.title}</DialogTitle>
        </DialogHeader>

        {/* Ajouter un inscrit */}
        {session.status !== "completed" && session.status !== "cancelled" && (
          <div className="flex gap-2 items-end py-2 border-b">
            <div className="flex-1 space-y-1">
              <Label>Inscrire un employé</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    availableEmployees.length === 0
                      ? "Tous les employés sont déjà inscrits"
                      : "Sélectionner un employé…"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedEmployee || enrollMut.isPending}
              onClick={() => enrollMut.mutate(Number(selectedEmployee))}
            >
              {enrollMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <UserPlus className="h-4 w-4" />}
              <span className="ml-1.5">Inscrire</span>
            </Button>
          </div>
        )}

        {/* Liste des inscrits */}
        <div className="max-h-[400px] overflow-y-auto">
          {session.enrollments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <UserMinus className="h-6 w-6" />
              <p className="text-sm">Aucun participant inscrit.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Résultat</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Certificat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.enrollments.map((enr) => (
                  <TableRow key={enr.id}>
                    <TableCell className="font-medium">{enr.employee_name}</TableCell>
                    <TableCell>
                      <Select
                        value={enr.result}
                        onValueChange={(v) => resultMut.mutate({ id: enr.id, result: v })}
                        disabled={resultMut.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RESULT_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {enr.score !== null ? `${enr.score} / 20` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant={enr.certificate_issued ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        disabled={enr.result !== "passed" || resultMut.isPending}
                        onClick={() =>
                          resultMut.mutate({
                            id: enr.id,
                            result: enr.result,
                            certificate_issued: !enr.certificate_issued,
                          })
                        }
                        title={enr.result !== "passed" ? "Résultat doit être «Réussi»" : ""}
                      >
                        <Award className="h-3.5 w-3.5 mr-1" />
                        {enr.certificate_issued ? "Délivré" : "Délivrer"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Carte session ─────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: TrainingSession }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm leading-tight">{session.title}</p>
          <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[session.status]}`}>
            {STATUS_LABELS[session.status]}
          </span>
        </div>
        {session.skill_name && (
          <p className="text-xs text-muted-foreground">Compétence : {session.skill_name}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {session.start_date} → {session.end_date}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {session.enrolled_count} inscrit(s)
          </span>
        </div>
        {session.trainer && <p className="text-xs text-muted-foreground">Formateur : {session.trainer}</p>}
        {session.location && <p className="text-xs text-muted-foreground">Lieu : {session.location}</p>}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {session.duration_hours > 0 && (
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />{session.duration_hours}h
            </Badge>
          )}
          {session.cost > 0 && (
            <Badge variant="outline" className="text-xs">{Number(session.cost).toFixed(0)} TND</Badge>
          )}
          {session.max_participants > 0 && (
            <Badge variant="outline" className="text-xs">Max {session.max_participants} pers.</Badge>
          )}
          <div className="ml-auto">
            <EnrollmentDialog session={session} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

function FormationsPage() {
  const [search, setSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");

  const skillsQ    = useQuery({ queryKey: ["skills"],              queryFn: () => fetchSkills() });
  const sessionsQ  = useQuery({ queryKey: ["training-sessions"],   queryFn: () => fetchTrainingSessions() });
  const upcomingQ  = useQuery({ queryKey: ["upcoming-trainings"],  queryFn: fetchUpcomingTrainings });
  const empSkillsQ = useQuery({ queryKey: ["employee-skills"],     queryFn: () => fetchEmployeeSkills() });

  const skills     = skillsQ.data?.results    ?? [];
  const sessions   = sessionsQ.data?.results  ?? [];
  const upcoming   = upcomingQ.data           ?? [];
  const empSkills  = empSkillsQ.data?.results ?? [];

  // ── KPI ───────────────────────────────────────────────────────────────────
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const totalHours     = sessions.reduce((sum, s) => sum + Number(s.duration_hours), 0);
  const certCount      = sessions
    .flatMap((s) => s.enrollments)
    .filter((e) => e.certificate_issued).length;

  // ── Filtres ───────────────────────────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.trainer ?? "").toLowerCase().includes(q) ||
        (s.skill_name ?? "").toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }, [skills, skillSearch]);

  return (
    <AppShell
      title="Compétences & Formations"
      actions={
        <div className="flex gap-2">
          <AddSkillDialog />
          <AddTrainingDialog skillOptions={skills} />
        </div>
      }
    >
      <div className="space-y-6">
        {/* ── KPI ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Compétences référencées", value: skills.length, icon: <BookOpen className="h-4 w-4" />, color: "text-primary" },
            { label: "Sessions à venir / en cours", value: upcoming.length, icon: <Calendar className="h-4 w-4" />, color: "text-blue-600" },
            { label: "Sessions terminées", value: completedCount, icon: <CheckCircle className="h-4 w-4" />, color: "text-muted-foreground" },
            { label: "Certificats délivrés", value: certCount, icon: <Award className="h-4 w-4" />, color: "text-green-600" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium text-muted-foreground flex items-center gap-1`}>
                  <span className={kpi.color}>{kpi.icon}</span>
                  {kpi.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Heures de formation cumulées */}
        {totalHours > 0 && (
          <div className="rounded-md border bg-muted/40 px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span><strong>{totalHours}h</strong> de formation cumulées sur toutes les sessions.</span>
          </div>
        )}

        <Tabs defaultValue="sessions">
          <TabsList>
            <TabsTrigger value="sessions">Sessions de formation</TabsTrigger>
            <TabsTrigger value="competences">Référentiel compétences</TabsTrigger>
            <TabsTrigger value="employes">Compétences employés</TabsTrigger>
          </TabsList>

          {/* ── Onglet Sessions ── */}
          <TabsContent value="sessions" className="space-y-5">

            {/* Sessions à venir en cartes */}
            {upcoming.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  À venir / En cours
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcoming.map((s) => <SessionCard key={s.id} session={s} />)}
                </div>
              </div>
            )}

            {/* Toutes les sessions en tableau */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Toutes les sessions
                </h2>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Titre, formateur, compétence…"
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {sessionsQ.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                    <BookOpen className="h-8 w-8" />
                    <p>{search ? "Aucune session ne correspond à la recherche." : "Aucune session de formation."}</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Titre</TableHead>
                          <TableHead>Compétence</TableHead>
                          <TableHead>Période</TableHead>
                          <TableHead>Formateur</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Durée</TableHead>
                          <TableHead className="text-center">Participants</TableHead>
                          <TableHead className="text-center">Inscrits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSessions.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.title}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.skill_name || "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{s.start_date} → {s.end_date}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.trainer || "—"}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status]}`}>
                                {STATUS_LABELS[s.status]}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-sm">{s.duration_hours}h</TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {s.max_participants > 0 ? s.max_participants : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              <EnrollmentDialog session={s} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Onglet Référentiel compétences ── */}
          <TabsContent value="competences">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Référentiel des compétences ({filteredSkills.length})</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher…"
                      className="pl-8"
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {skillsQ.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                    <CheckCircle className="h-8 w-8" />
                    <p>{skillSearch ? "Aucune compétence ne correspond." : "Aucune compétence référencée."}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSkills.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {CATEGORY_LABELS[s.category] ?? s.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={s.description}>
                            {s.description || "—"}
                          </TableCell>
                          <TableCell>
                            {s.is_active
                              ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Actif</Badge>
                              : <Badge variant="secondary" className="text-xs">Inactif</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Onglet Compétences employés ── */}
          <TabsContent value="employes">
            <Card>
              <CardHeader>
                <CardTitle>Compétences par employé ({empSkills.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {empSkillsQ.isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : empSkills.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                    <Users className="h-8 w-8" />
                    <p>Aucune compétence attribuée à un employé.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead>
                        <TableHead>Compétence</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Niveau</TableHead>
                        <TableHead>Date d'acquisition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {empSkills.map((es) => (
                        <TableRow key={es.id}>
                          <TableCell className="font-medium">{es.employee_name}</TableCell>
                          <TableCell>{es.skill_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {CATEGORY_LABELS[es.skill_category] ?? es.skill_category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`text-xs ${
                                es.level === "expert"       ? "bg-purple-100 text-purple-800" :
                                es.level === "advanced"     ? "bg-blue-100 text-blue-800" :
                                es.level === "intermediate" ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {LEVEL_LABELS[es.level] ?? es.level}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {es.acquired_date ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}