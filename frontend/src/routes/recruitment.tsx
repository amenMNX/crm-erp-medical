import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Phone,
  Plus,
  Star,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { fetchEmployees } from "@/lib/employees-api";
import { getAuthUser } from "@/lib/auth";

export const Route = createFileRoute("/recruitment")({
  head: () => ({ meta: [{ title: "Recrutement" }] }),
  component: RecruitmentPage,
});

// ── Local types (stored in localStorage, no backend endpoint yet) ─────────────

type ContractType = "cdi" | "cdd" | "intern" | "consultant" | "freelance";
type ExperienceLevel = "entry" | "junior" | "senior" | "expert";
type JobStatus = "draft" | "published" | "closed";
type AppStatus = "pending" | "interview" | "offer" | "accepted" | "rejected";

type LocalJobPost = {
  id: number;
  title: string;
  department: string;
  contract_type: ContractType;
  experience_level: ExperienceLevel;
  location: string;
  description: string;
  requirements: string;
  benefits: string;
  closing_date: string;
  is_internal: boolean;
  status: JobStatus;
  created_at: string;
};

type LocalApplication = {
  id: number;
  job_id: number;
  job_title: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  cover_letter: string;
  status: AppStatus;
  interview_date: string;
  rating: number | null;
  applied_at: string;
};

// ── Storage helpers ───────────────────────────────────────────────────────────

const JOBS_KEY = "recruitment-jobs-v1";
const APPS_KEY = "recruitment-apps-v1";

function loadJobs(): LocalJobPost[] {
  try { return JSON.parse(localStorage.getItem(JOBS_KEY) ?? "[]"); } catch { return []; }
}
function saveJobs(d: LocalJobPost[]) { localStorage.setItem(JOBS_KEY, JSON.stringify(d)); }

function loadApps(): LocalApplication[] {
  try { return JSON.parse(localStorage.getItem(APPS_KEY) ?? "[]"); } catch { return []; }
}
function saveApps(d: LocalApplication[]) { localStorage.setItem(APPS_KEY, JSON.stringify(d)); }

// ── Badge helpers ─────────────────────────────────────────────────────────────

const contractLabels: Record<ContractType, string> = {
  cdi: "CDI", cdd: "CDD", intern: "Stage", consultant: "Consultant", freelance: "Freelance",
};
const levelLabels: Record<ExperienceLevel, string> = {
  entry: "Débutant", junior: "Junior", senior: "Senior", expert: "Expert",
};
const jobStatusLabel: Record<JobStatus, string> = {
  draft: "Brouillon", published: "Publiée", closed: "Clôturée",
};
const appStatusLabel: Record<AppStatus, string> = {
  pending: "En attente", interview: "Entretien", offer: "Offre envoyée",
  accepted: "Accepté", rejected: "Rejeté",
};

function jobBadge(s: JobStatus) {
  if (s === "published") return "bg-green-100 text-green-700 border-0";
  if (s === "closed") return "bg-destructive/15 text-destructive border-0";
  return "bg-muted text-muted-foreground border-0";
}
function appBadge(s: AppStatus) {
  if (s === "accepted") return "bg-green-100 text-green-700 border-0";
  if (s === "rejected") return "bg-destructive/15 text-destructive border-0";
  if (s === "interview") return "bg-purple-100 text-purple-700 border-0";
  if (s === "offer") return "bg-blue-100 text-blue-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

// ── Job form ──────────────────────────────────────────────────────────────────

const emptyJob = (): Omit<LocalJobPost, "id" | "status" | "created_at"> => ({
  title: "", department: "", contract_type: "cdi", experience_level: "junior",
  location: "", description: "", requirements: "", benefits: "", closing_date: "", is_internal: false,
});

const emptyApp = (jobId = 0, jobTitle = ""): Omit<LocalApplication, "id" | "status" | "applied_at" | "rating"> => ({
  job_id: jobId, job_title: jobTitle,
  first_name: "", last_name: "", email: "", phone: "", cover_letter: "", interview_date: "",
});

// ── Main page ─────────────────────────────────────────────────────────────────

function RecruitmentPage() {
  const user = getAuthUser();
  const isHr = user?.role === "hr" || user?.role === "admin" || user?.is_super_admin;

  const empQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const activeEmployees = (empQuery.data ?? []).filter((e) => e.is_active);

  const [jobs, setJobs] = useState<LocalJobPost[]>(loadJobs);
  const [apps, setApps] = useState<LocalApplication[]>(loadApps);

  const [jobOpen, setJobOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [jobForm, setJobForm] = useState(emptyJob());
  const [appForm, setAppForm] = useState(emptyApp());

  const [detailJob, setDetailJob] = useState<LocalJobPost | null>(null);
  const [detailApp, setDetailApp] = useState<LocalApplication | null>(null);

  function persistJobs(next: LocalJobPost[]) { setJobs(next); saveJobs(next); }
  function persistApps(next: LocalApplication[]) { setApps(next); saveApps(next); }

  function handleCreateJob() {
    if (!jobForm.title || !jobForm.description || !jobForm.requirements) {
      toast.error("Titre, description et exigences sont requis.");
      return;
    }
    const job: LocalJobPost = { ...jobForm, id: Date.now(), status: "draft", created_at: new Date().toISOString() };
    persistJobs([job, ...jobs]);
    setJobOpen(false);
    setJobForm(emptyJob());
    toast.success("Offre créée.");
  }

  function handleCreateApp() {
    if (!appForm.job_id || !appForm.first_name || !appForm.last_name || !appForm.email) {
      toast.error("Offre, prénom, nom et email sont requis.");
      return;
    }
    const app: LocalApplication = { ...appForm, id: Date.now(), status: "pending", rating: null, applied_at: new Date().toISOString() };
    persistApps([app, ...apps]);
    setAppOpen(false);
    setAppForm(emptyApp());
    toast.success("Candidature enregistrée.");
  }

  function publishJob(id: number) {
    persistJobs(jobs.map((j) => j.id === id ? { ...j, status: "published" as JobStatus } : j));
    toast.success("Offre publiée.");
  }
  function closeJob(id: number) {
    persistJobs(jobs.map((j) => j.id === id ? { ...j, status: "closed" as JobStatus } : j));
    toast.success("Offre clôturée.");
  }

  function advanceApp(id: number, status: AppStatus) {
    persistApps(apps.map((a) => a.id === id ? { ...a, status } : a));
    toast.success("Statut mis à jour.");
  }

  function rateApp(id: number, rating: number) {
    persistApps(apps.map((a) => a.id === id ? { ...a, rating } : a));
  }

  const publishedJobs = jobs.filter((j) => j.status === "published");

  return (
    <AppShell
      title="Recrutement"
      actions={
        <div className="flex gap-2">
          {isHr && (
            <Dialog open={jobOpen} onOpenChange={setJobOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nouvelle offre
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Créer une offre d'emploi</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label>Titre *</Label>
                    <Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} placeholder="Ex: Infirmier(ère) diplômé(e)" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Département</Label>
                      <Input value={jobForm.department} onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })} placeholder="Ex: Medical" />
                    </div>
                    <div>
                      <Label>Localisation</Label>
                      <Input value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} placeholder="Ex: Tunis" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Contrat</Label>
                      <Select value={jobForm.contract_type} onValueChange={(v) => setJobForm({ ...jobForm, contract_type: v as ContractType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(contractLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Niveau d'expérience</Label>
                      <Select value={jobForm.experience_level} onValueChange={(v) => setJobForm({ ...jobForm, experience_level: v as ExperienceLevel })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(levelLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Date de clôture</Label>
                    <Input type="date" value={jobForm.closing_date} onChange={(e) => setJobForm({ ...jobForm, closing_date: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="internal" checked={jobForm.is_internal} onChange={(e) => setJobForm({ ...jobForm, is_internal: e.target.checked })} className="h-4 w-4" />
                    <Label htmlFor="internal">Offre interne (employés uniquement)</Label>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} rows={3} placeholder="Décrivez le poste…" />
                  </div>
                  <div>
                    <Label>Exigences *</Label>
                    <Textarea value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} rows={3} placeholder="Compétences requises, diplômes…" />
                  </div>
                  <div>
                    <Label>Avantages</Label>
                    <Textarea value={jobForm.benefits} onChange={(e) => setJobForm({ ...jobForm, benefits: e.target.value })} rows={2} placeholder="Mutuelle, tickets repas…" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setJobOpen(false)}>Annuler</Button>
                  <Button type="button" onClick={handleCreateJob}>Créer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={appOpen} onOpenChange={setAppOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserPlus className="h-4 w-4 mr-1" />
                Candidature
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Enregistrer une candidature</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Offre *</Label>
                  <Select
                    value={String(appForm.job_id || "")}
                    onValueChange={(v) => {
                      const job = jobs.find((j) => j.id === Number(v));
                      setAppForm({ ...appForm, job_id: Number(v), job_title: job?.title ?? "" });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choisir une offre publiée" /></SelectTrigger>
                    <SelectContent>
                      {publishedJobs.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
                      {publishedJobs.length === 0 && <SelectItem value="" disabled>Aucune offre publiée</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prénom *</Label><Input value={appForm.first_name} onChange={(e) => setAppForm({ ...appForm, first_name: e.target.value })} /></div>
                  <div><Label>Nom *</Label><Input value={appForm.last_name} onChange={(e) => setAppForm({ ...appForm, last_name: e.target.value })} /></div>
                </div>
                <div><Label>Email *</Label><Input type="email" value={appForm.email} onChange={(e) => setAppForm({ ...appForm, email: e.target.value })} /></div>
                <div><Label>Téléphone</Label><Input value={appForm.phone} onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })} /></div>
                <div><Label>Lettre de motivation</Label><Textarea value={appForm.cover_letter} onChange={(e) => setAppForm({ ...appForm, cover_letter: e.target.value })} rows={3} /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAppOpen(false)}>Annuler</Button>
                <Button type="button" onClick={handleCreateApp}>Enregistrer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      {/* Stats bar */}
      <div className="grid gap-3 sm:grid-cols-4 mb-4">
        <StatMini icon={Briefcase} label="Offres actives" value={jobs.filter((j) => j.status === "published").length} color="blue" />
        <StatMini icon={Users} label="Candidatures" value={apps.length} color="purple" />
        <StatMini icon={Calendar} label="Entretiens" value={apps.filter((a) => a.status === "interview").length} color="orange" />
        <StatMini icon={UserCheck} label="Acceptés" value={apps.filter((a) => a.status === "accepted").length} color="green" />
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">
            <Briefcase className="h-4 w-4 mr-1" />
            Offres ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="applications">
            <Users className="h-4 w-4 mr-1" />
            Candidatures ({apps.length})
          </TabsTrigger>
        </TabsList>

        {/* Jobs tab */}
        <TabsContent value="jobs" className="space-y-3 mt-3">
          {jobs.length === 0 && (
            <p className="text-center py-12 text-sm text-muted-foreground">
              Aucune offre créée. Cliquez sur « Nouvelle offre » pour commencer.
            </p>
          )}
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2 gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{job.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={jobBadge(job.status)}>{jobStatusLabel[job.status]}</Badge>
                    <span className="text-xs text-muted-foreground">{contractLabels[job.contract_type]}</span>
                    <span className="text-xs text-muted-foreground">· {levelLabels[job.experience_level]}</span>
                    {job.is_internal && <Badge variant="outline" className="text-xs">Interne</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  <span className="text-xs text-muted-foreground">
                    {apps.filter((a) => a.job_id === job.id).length} candidature(s)
                  </span>
                  {isHr && job.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => publishJob(job.id)}>Publier</Button>
                  )}
                  {isHr && job.status === "published" && (
                    <Button size="sm" variant="outline" onClick={() => closeJob(job.id)}>Clôturer</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDetailJob(job)}>Détails</Button>
                </div>
              </CardHeader>
              {(job.location || job.closing_date) && (
                <CardContent className="pt-0 text-xs text-muted-foreground flex gap-4">
                  {job.location && <span>📍 {job.location}</span>}
                  {job.department && <span><Building2 className="inline h-3 w-3 mr-0.5" />{job.department}</span>}
                  {job.closing_date && <span>📅 Clôture : {job.closing_date}</span>}
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* Applications tab */}
        <TabsContent value="applications" className="space-y-3 mt-3">
          {apps.length === 0 && (
            <p className="text-center py-12 text-sm text-muted-foreground">
              Aucune candidature enregistrée.
            </p>
          )}
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2 gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">
                    {app.first_name} {app.last_name}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={appBadge(app.status)}>{appStatusLabel[app.status]}</Badge>
                    <span className="text-xs text-muted-foreground">{app.job_title}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {app.rating && (
                    <span className="flex items-center text-xs gap-1">
                      <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                      {app.rating}/5
                    </span>
                  )}
                  {isHr && app.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => advanceApp(app.id, "interview")}>
                        <Calendar className="h-3 w-3 mr-1" />Entretien
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => advanceApp(app.id, "rejected")}>
                        <XCircle className="h-3 w-3 mr-1" />Rejeter
                      </Button>
                    </>
                  )}
                  {isHr && app.status === "interview" && (
                    <Button size="sm" variant="outline" onClick={() => advanceApp(app.id, "offer")}>
                      <Mail className="h-3 w-3 mr-1" />Envoyer offre
                    </Button>
                  )}
                  {isHr && app.status === "offer" && (
                    <Button size="sm" variant="outline" onClick={() => advanceApp(app.id, "accepted")}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />Accepter
                    </Button>
                  )}
                  {isHr && !app.rating && app.status !== "rejected" && (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => rateApp(app.id, n)}
                          className="text-muted-foreground hover:text-yellow-400"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDetailApp(app)}>Détails</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground flex gap-4 flex-wrap">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{app.email}</span>
                {app.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{app.phone}</span>}
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Postulé le {app.applied_at.slice(0, 10)}</span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Job detail dialog */}
      <Dialog open={!!detailJob} onOpenChange={() => setDetailJob(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailJob?.title}</DialogTitle>
          </DialogHeader>
          {detailJob && (
            <div className="space-y-4 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge className={jobBadge(detailJob.status)}>{jobStatusLabel[detailJob.status]}</Badge>
                <Badge variant="outline">{contractLabels[detailJob.contract_type]}</Badge>
                <Badge variant="outline">{levelLabels[detailJob.experience_level]}</Badge>
                {detailJob.is_internal && <Badge variant="outline">Interne</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                {detailJob.department && <div>Département : {detailJob.department}</div>}
                {detailJob.location && <div>Localisation : {detailJob.location}</div>}
                {detailJob.closing_date && <div>Clôture : {detailJob.closing_date}</div>}
                <div>Candidatures : {apps.filter((a) => a.job_id === detailJob.id).length}</div>
              </div>
              <div>
                <p className="font-medium mb-1">Description</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{detailJob.description}</p>
              </div>
              <div>
                <p className="font-medium mb-1">Exigences</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{detailJob.requirements}</p>
              </div>
              {detailJob.benefits && (
                <div>
                  <p className="font-medium mb-1">Avantages</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detailJob.benefits}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Application detail dialog */}
      <Dialog open={!!detailApp} onOpenChange={() => setDetailApp(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailApp?.first_name} {detailApp?.last_name}</DialogTitle>
          </DialogHeader>
          {detailApp && (
            <div className="space-y-3 text-sm">
              <Badge className={appBadge(detailApp.status)}>{appStatusLabel[detailApp.status]}</Badge>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Email : {detailApp.email}</div>
                <div>Poste : {detailApp.job_title}</div>
                {detailApp.phone && <div>Téléphone : {detailApp.phone}</div>}
                <div>Postulé : {detailApp.applied_at.slice(0, 10)}</div>
              </div>
              {detailApp.cover_letter && (
                <div>
                  <p className="font-medium mb-1">Lettre de motivation</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detailApp.cover_letter}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ── StatMini ──────────────────────────────────────────────────────────────────

function StatMini({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorMap = {
    blue: "bg-blue-500/10 text-blue-600",
    green: "bg-green-500/10 text-green-600",
    purple: "bg-purple-500/10 text-purple-600",
    orange: "bg-orange-500/10 text-orange-600",
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}