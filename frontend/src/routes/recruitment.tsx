import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Calendar, Eye, Loader2, Mail, Plus, Star, UserPlus, Users, XCircle } from "lucide-react";
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
import { acceptApplication, advanceToInterview, createApplication, createJobPost, fetchApplications, fetchJobPosts, publishJobPost, rejectApplication, sendOffer, type ApiApplication, type ApiJobPost, type ApplicationPayload, type JobPostPayload } from "@/lib/recruitment-api";
import { getAuthUser } from "@/lib/auth";

export const Route = createFileRoute("/recruitment")({
  head: () => ({ meta: [{ title: "Recrutement" }] }),
  component: RecruitmentPage,
});

const jobBadge = (s: string) => s === "published" ? "bg-green-100 text-green-700 border-0" : s === "closed" ? "bg-destructive/15 text-destructive border-0" : "bg-muted text-muted-foreground border-0";
const appBadge = (s: string) => s === "accepted" ? "bg-green-100 text-green-700 border-0" : s === "rejected" ? "bg-destructive/15 text-destructive border-0" : s === "interview" ? "bg-purple-100 text-purple-700 border-0" : s === "offer" ? "bg-blue-100 text-blue-700 border-0" : "bg-muted text-muted-foreground border-0";

function RecruitmentPage() {
  const qc = useQueryClient();
  const user = getAuthUser();
  const isHr = user?.role === "hr" || user?.role === "admin" || user?.is_super_admin;

  const jobsQuery = useQuery({ queryKey: ["job-posts"],    queryFn: fetchJobPosts });
  const appsQuery = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });

  const [jobOpen, setJobOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<ApiJobPost | null>(null);
  const [detailApp, setDetailApp] = useState<ApiApplication | null>(null);

  const [jobForm, setJobForm] = useState<JobPostPayload>({ title: "", department: "", contract_type: "cdi", experience_level: "junior", location: "", description: "", requirements: "", benefits: "", closing_date: "", is_internal: false });
  const [appForm, setAppForm] = useState<ApplicationPayload>({ job_post: 0, first_name: "", last_name: "", email: "", phone: "", cover_letter_text: "" });

  const inv = () => { qc.invalidateQueries({ queryKey: ["job-posts"] }); qc.invalidateQueries({ queryKey: ["applications"] }); };

  const createJobMutation = useMutation({ mutationFn: createJobPost, onSuccess: () => { inv(); setJobOpen(false); toast.success("Offre créée."); }, onError: () => toast.error("Erreur.") });
  const createAppMutation = useMutation({ mutationFn: createApplication, onSuccess: () => { inv(); setAppOpen(false); toast.success("Candidature envoyée."); }, onError: () => toast.error("Erreur.") });
  const publishMutation   = useMutation({ mutationFn: publishJobPost, onSuccess: () => { inv(); toast.success("Offre publiée."); } });
  const actionMutation    = useMutation({ mutationFn: ({ fn }: { fn: () => Promise<ApiApplication> }) => fn(), onSuccess: () => { inv(); toast.success("Action effectuée."); }, onError: () => toast.error("Erreur.") });

  const jobs = jobsQuery.data ?? [];
  const apps = appsQuery.data ?? [];

  return (
    <AppShell
      title="Recrutement"
      actions={
        <div className="flex gap-2">
          {isHr && (
            <Dialog open={jobOpen} onOpenChange={setJobOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nouvelle offre</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Créer une offre d'emploi</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createJobMutation.mutate(jobForm); }} className="space-y-3">
                  <div><Label>Titre *</Label><Input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Département</Label><Input value={jobForm.department ?? ""} onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })} /></div>
                    <div><Label>Localisation</Label><Input value={jobForm.location ?? ""} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Contrat</Label><Select value={jobForm.contract_type} onValueChange={(v) => setJobForm({ ...jobForm, contract_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cdi">CDI</SelectItem><SelectItem value="cdd">CDD</SelectItem><SelectItem value="intern">Stage</SelectItem><SelectItem value="freelance">Freelance</SelectItem></SelectContent></Select></div>
                    <div><Label>Niveau</Label><Select value={jobForm.experience_level} onValueChange={(v) => setJobForm({ ...jobForm, experience_level: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entry">Débutant</SelectItem><SelectItem value="junior">Junior</SelectItem><SelectItem value="senior">Senior</SelectItem><SelectItem value="expert">Expert</SelectItem></SelectContent></Select></div>
                  </div>
                  <div><Label>Date de clôture</Label><Input type="date" value={jobForm.closing_date ?? ""} onChange={(e) => setJobForm({ ...jobForm, closing_date: e.target.value })} /></div>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={jobForm.is_internal} onChange={(e) => setJobForm({ ...jobForm, is_internal: e.target.checked })} className="h-4 w-4" /><Label>Offre interne</Label></div>
                  <div><Label>Description *</Label><Textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} rows={3} required /></div>
                  <div><Label>Exigences *</Label><Textarea value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} rows={3} required /></div>
                  <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setJobOpen(false)}>Annuler</Button><Button type="submit" disabled={createJobMutation.isPending}>{createJobMutation.isPending ? "Création..." : "Créer"}</Button></div>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={appOpen} onOpenChange={setAppOpen}>
            <DialogTrigger asChild><Button variant="outline"><UserPlus className="h-4 w-4 mr-1" />Recommander</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Recommander un candidat</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createAppMutation.mutate(appForm); }} className="space-y-3">
                <div><Label>Offre *</Label><Select value={String(appForm.job_post || "")} onValueChange={(v) => setAppForm({ ...appForm, job_post: Number(v) })}><SelectTrigger><SelectValue placeholder="Choisir une offre" /></SelectTrigger><SelectContent>{jobs.filter((j) => j.status === "published").map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid grid-cols-2 gap-3"><div><Label>Prénom *</Label><Input value={appForm.first_name} onChange={(e) => setAppForm({ ...appForm, first_name: e.target.value })} required /></div><div><Label>Nom *</Label><Input value={appForm.last_name} onChange={(e) => setAppForm({ ...appForm, last_name: e.target.value })} required /></div></div>
                <div><Label>Email *</Label><Input type="email" value={appForm.email} onChange={(e) => setAppForm({ ...appForm, email: e.target.value })} required /></div>
                <div><Label>Téléphone</Label><Input value={appForm.phone ?? ""} onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })} /></div>
                <div><Label>Lettre de motivation</Label><Textarea value={appForm.cover_letter_text ?? ""} onChange={(e) => setAppForm({ ...appForm, cover_letter_text: e.target.value })} rows={3} /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAppOpen(false)}>Annuler</Button><Button type="submit" disabled={createAppMutation.isPending}>{createAppMutation.isPending ? "Envoi..." : "Recommander"}</Button></div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Tabs defaultValue="jobs">
        <TabsList><TabsTrigger value="jobs"><Briefcase className="h-4 w-4 mr-1" />Offres ({jobs.length})</TabsTrigger><TabsTrigger value="applications"><Users className="h-4 w-4 mr-1" />Candidatures ({apps.length})</TabsTrigger></TabsList>
        <TabsContent value="jobs" className="space-y-3 mt-3">
          {jobsQuery.isLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement...</div>}
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div><CardTitle className="text-base">{job.title}</CardTitle><div className="flex items-center gap-2 mt-1 flex-wrap"><Badge className={jobBadge(job.status)}>{job.status_display}</Badge><span className="text-xs text-muted-foreground">{job.contract_type_display}</span>{job.is_internal && <Badge variant="outline" className="text-xs">Interne</Badge>}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><span className="text-xs text-muted-foreground">{job.application_count} candidature(s)</span>{isHr && job.status === "draft" && <Button size="sm" variant="outline" onClick={() => publishMutation.mutate(job.id)}>Publier</Button>}<Button size="sm" variant="ghost" onClick={() => setDetailJob(job)}><Eye className="h-4 w-4" /></Button></div>
              </CardHeader>
              {(job.location || job.closing_date) && <CardContent className="pt-0 text-xs text-muted-foreground flex gap-4">{job.location && <span>📍 {job.location}</span>}{job.closing_date && <span>📅 Clôture : {job.closing_date}</span>}</CardContent>}
            </Card>
          ))}
          {!jobsQuery.isLoading && jobs.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune offre.</p>}
        </TabsContent>
        <TabsContent value="applications" className="space-y-3 mt-3">
          {appsQuery.isLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement...</div>}
          {apps.map((app) => (
            <Card key={app.id}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div><CardTitle className="text-base">{app.first_name} {app.last_name}</CardTitle><div className="flex items-center gap-2 mt-1 flex-wrap"><Badge className={appBadge(app.status)}>{app.status_display}</Badge><span className="text-xs text-muted-foreground">{app.job_title}</span></div></div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {app.rating && <span className="flex items-center text-xs gap-1"><Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />{app.rating}/5</span>}
                  {isHr && app.status === "pending" && (<><Button size="sm" variant="outline" onClick={() => { const d = prompt("Date entretien (YYYY-MM-DDTHH:mm) :"); if (d) actionMutation.mutate({ fn: () => advanceToInterview(app.id, d) }); }}><Calendar className="h-3 w-3 mr-1" />Entretien</Button><Button size="sm" variant="ghost" onClick={() => { const r = prompt("Motif :") ?? ""; actionMutation.mutate({ fn: () => rejectApplication(app.id, r) }); }}><XCircle className="h-3 w-3 mr-1" />Rejeter</Button></>)}
                  {isHr && app.status === "interview" && <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ fn: () => sendOffer(app.id) })}><Mail className="h-3 w-3 mr-1" />Envoyer offre</Button>}
                  {isHr && app.status === "offer" && <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ fn: () => acceptApplication(app.id) })}><UserPlus className="h-3 w-3 mr-1" />Accepter</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setDetailApp(app)}><Eye className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground flex gap-4"><span>📧 {app.email}</span>{app.phone && <span>📱 {app.phone}</span>}</CardContent>
            </Card>
          ))}
          {!appsQuery.isLoading && apps.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune candidature.</p>}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailJob} onOpenChange={() => setDetailJob(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{detailJob?.title}</DialogTitle></DialogHeader>
          {detailJob && <div className="space-y-4 text-sm"><div className="flex gap-2 flex-wrap"><Badge className={jobBadge(detailJob.status)}>{detailJob.status_display}</Badge><Badge variant="outline">{detailJob.contract_type_display}</Badge>{detailJob.is_internal && <Badge variant="outline">Interne</Badge>}</div><div className="grid grid-cols-2 gap-2 text-muted-foreground"><div>Département : {detailJob.department || "—"}</div><div>Candidatures : {detailJob.application_count}</div>{detailJob.closing_date && <div>Clôture : {detailJob.closing_date}</div>}</div><div><p className="font-medium mb-1">Description</p><p className="whitespace-pre-wrap text-muted-foreground">{detailJob.description}</p></div><div><p className="font-medium mb-1">Exigences</p><p className="whitespace-pre-wrap text-muted-foreground">{detailJob.requirements}</p></div>{detailJob.benefits && <div><p className="font-medium mb-1">Avantages</p><p className="whitespace-pre-wrap text-muted-foreground">{detailJob.benefits}</p></div>}</div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailApp} onOpenChange={() => setDetailApp(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{detailApp?.first_name} {detailApp?.last_name}</DialogTitle></DialogHeader>
          {detailApp && <div className="space-y-3 text-sm"><Badge className={appBadge(detailApp.status)}>{detailApp.status_display}</Badge><div className="grid grid-cols-2 gap-2 text-muted-foreground"><div>Email : {detailApp.email}</div><div>Poste : {detailApp.job_title}</div></div>{detailApp.cover_letter_text && <div><p className="font-medium mb-1">Lettre de motivation</p><p className="whitespace-pre-wrap text-muted-foreground">{detailApp.cover_letter_text}</p></div>}{detailApp.feedback && <div><p className="font-medium mb-1">Feedback</p><p className="text-muted-foreground">{detailApp.feedback}</p></div>}</div>}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
