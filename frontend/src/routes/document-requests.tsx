import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createDocumentRequest, fetchDocumentRequests, markDocumentReady, markDocumentRefused, DOC_TYPE_LABELS, type DocRequestType } from "@/lib/document-requests-api";
import { getAuthUser } from "@/lib/auth";

export const Route = createFileRoute("/document-requests")({
  head: () => ({ meta: [{ title: "Demandes de documents" }] }),
  component: DocumentRequestsPage,
});

function statusClass(s: string) {
  if (s === "Prêt")     return "bg-green-100 text-green-700 border-0";
  if (s === "Refusé")   return "bg-destructive/15 text-destructive border-0";
  if (s === "En cours") return "bg-blue-100 text-blue-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

function DocumentRequestsPage() {
  const qc = useQueryClient();
  const user = getAuthUser();
  const isHr = user?.role === "hr" || user?.role === "admin" || user?.is_super_admin;

  const reqQuery = useQuery({ queryKey: ["document-requests"], queryFn: fetchDocumentRequests });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const createMutation = useMutation({
    mutationFn: createDocumentRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document-requests"] }); setOpen(false); toast.success("Demande envoyée."); },
    onError: () => toast.error("Erreur lors de l'envoi."),
  });
  const readyMutation   = useMutation({ mutationFn: markDocumentReady,   onSuccess: () => qc.invalidateQueries({ queryKey: ["document-requests"] }) });
  const refusedMutation = useMutation({ mutationFn: markDocumentRefused, onSuccess: () => qc.invalidateQueries({ queryKey: ["document-requests"] }) });

  const reqs = (reqQuery.data ?? []).filter((r) => {
    const q = search.toLowerCase();
    return !q || r.employee_name.toLowerCase().includes(q) || r.document_type_display.toLowerCase().includes(q);
  });

  return (
    <AppShell
      title="Demandes de documents"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nouvelle demande</Button></DialogTrigger>
          <DialogContent>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); createMutation.mutate({ employee: Number(fd.get("employee")), document_type: String(fd.get("document_type")) as DocRequestType, motif: String(fd.get("motif") ?? "").trim() }); }}>
              <DialogHeader><DialogTitle>Demande de document</DialogTitle></DialogHeader>
              <div className="space-y-3 py-3">
                {isHr && (<div><Label>Employé ID</Label><Input name="employee" type="number" required /></div>)}
                <div>
                  <Label>Type de document</Label>
                  <Select name="document_type" required>
                    <SelectTrigger><SelectValue placeholder="Choisir un type" /></SelectTrigger>
                    <SelectContent>{Object.entries(DOC_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Motif (optionnel)</Label><Textarea name="motif" rows={3} /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Envoi..." : "Envoyer"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-9" />
          </div>
          {reqQuery.isLoading
            ? <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement...</div>
            : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isHr && <TableHead>Employé</TableHead>}
                    <TableHead>Document</TableHead>
                    <TableHead>Motif</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    {isHr && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reqs.map((r) => (
                    <TableRow key={r.id}>
                      {isHr && <TableCell>{r.employee_name}</TableCell>}
                      <TableCell className="font-medium"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{r.document_type_display}</div></TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.motif || "—"}</TableCell>
                      <TableCell><Badge className={statusClass(r.statut)}>{r.statut}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{r.created_at.slice(0, 10)}</TableCell>
                      {isHr && (
                        <TableCell className="flex gap-2">
                          {r.statut !== "Prêt" && r.statut !== "Refusé" && (<>
                            <Button size="sm" variant="outline" onClick={() => readyMutation.mutate(r.id)} disabled={readyMutation.isPending}>Prêt</Button>
                            <Button size="sm" variant="ghost" onClick={() => refusedMutation.mutate(r.id)} disabled={refusedMutation.isPending}>Refuser</Button>
                          </>)}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {reqs.length === 0 && <TableRow><TableCell colSpan={isHr ? 6 : 4} className="text-center py-8 text-sm text-muted-foreground">Aucune demande.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
