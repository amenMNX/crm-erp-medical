import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle, Eye, FileText, Loader2, Plus, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cancelEntry, createJournalEntry, fetchAccounts, fetchBalanceSheet, fetchIncomeStatement, fetchJournalEntries, fetchJournals, postEntry, type ApiJournalEntry, type CreateEntryPayload, type EntryLinePayload } from "@/lib/accounting-api";
import { getAuthUser } from "@/lib/auth";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [{ title: "Comptabilité" }] }),
  component: AccountingPage,
});

const statusBadge = (s: string) => s === "posted" ? "bg-green-100 text-green-700 border-0" : s === "cancelled" ? "bg-destructive/15 text-destructive border-0" : "bg-muted text-muted-foreground border-0";
const fmt = (v: string | number) => new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", minimumFractionDigits: 3 }).format(Number(v) || 0);
const EMPTY: EntryLinePayload = { account: 0, debit: 0, credit: 0, description: "" };

function AccountingPage() {
  const qc = useQueryClient();
  const user = getAuthUser();
  const isAccountant = user?.role === "accountant" || user?.role === "admin" || user?.is_super_admin;

  const entriesQuery  = useQuery({ queryKey: ["journal-entries"], queryFn: fetchJournalEntries });
  const journalsQuery = useQuery({ queryKey: ["journals"],        queryFn: fetchJournals });
  const accountsQuery = useQuery({ queryKey: ["coa"],             queryFn: fetchAccounts });

  const [open,    setOpen]    = useState(false);
  const [detail,  setDetail]  = useState<ApiJournalEntry | null>(null);
  const [bsDate,  setBsDate]  = useState("");
  const [isStart, setIsStart] = useState("");
  const [isEnd,   setIsEnd]   = useState("");
  const [form,    setForm]    = useState<CreateEntryPayload>({ journal_id: 0, entry_date: "", description: "", reference: "", lines: [{ ...EMPTY }, { ...EMPTY }] });

  const bsQuery = useQuery({ queryKey: ["balance-sheet", bsDate],      queryFn: () => fetchBalanceSheet(bsDate),                 enabled: !!bsDate });
  const isQuery = useQuery({ queryKey: ["income-stmt", isStart, isEnd], queryFn: () => fetchIncomeStatement(isStart, isEnd), enabled: !!(isStart && isEnd) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["journal-entries"] });

  const createMutation = useMutation({ mutationFn: createJournalEntry, onSuccess: () => { invalidate(); setOpen(false); toast.success("Écriture créée."); }, onError: (e: Error) => toast.error(e.message || "Erreur.") });
  const postMutation   = useMutation({ mutationFn: postEntry,   onSuccess: () => { invalidate(); toast.success("Écriture validée."); }, onError: (e: Error) => toast.error(e.message || "Erreur.") });
  const cancelMutation = useMutation({ mutationFn: cancelEntry, onSuccess: () => { invalidate(); toast.success("Écriture annulée."); } });

  const entries  = entriesQuery.data  ?? [];
  const journals = journalsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  const updateLine = (i: number, field: keyof EntryLinePayload, value: number | string) => {
    const lines = [...form.lines];
    lines[i] = { ...lines[i], [field]: value };
    if (field === "debit"  && Number(value) > 0) lines[i].credit = 0;
    if (field === "credit" && Number(value) > 0) lines[i].debit  = 0;
    setForm({ ...form, lines });
  };
  const addLine    = () => setForm({ ...form, lines: [...form.lines, { ...EMPTY }] });
  const removeLine = (i: number) => { if (form.lines.length <= 2) { toast.warning("Minimum 2 lignes."); return; } setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) }); };

  return (
    <AppShell
      title="Comptabilité"
      actions={
        isAccountant ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nouvelle écriture</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nouvelle écriture comptable</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Journal *</Label><Select value={String(form.journal_id || "")} onValueChange={(v) => setForm({ ...form, journal_id: Number(v) })}><SelectTrigger><SelectValue placeholder="Choisir un journal" /></SelectTrigger><SelectContent>{journals.map((j) => <SelectItem key={j.id} value={String(j.id)}>{j.code} — {j.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Date *</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required /></div>
                </div>
                <div><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></div>
                <div><Label>Référence</Label><Input value={form.reference ?? ""} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Facture #, pièce #..." /></div>
                <div className="space-y-2">
                  <Label>Lignes d'écriture</Label>
                  <div className="text-xs text-muted-foreground grid grid-cols-12 gap-2 px-1"><span className="col-span-4">Compte</span><span className="col-span-2">Débit</span><span className="col-span-2">Crédit</span><span className="col-span-3">Description</span></div>
                  {form.lines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4"><Select value={String(line.account || "")} onValueChange={(v) => updateLine(i, "account", Number(v))}><SelectTrigger><SelectValue placeholder="Compte" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>)}</SelectContent></Select></div>
                      <div className="col-span-2"><Input type="number" step="0.001" min="0" placeholder="Débit" value={line.debit || ""} onChange={(e) => updateLine(i, "debit", parseFloat(e.target.value) || 0)} className="text-green-700" /></div>
                      <div className="col-span-2"><Input type="number" step="0.001" min="0" placeholder="Crédit" value={line.credit || ""} onChange={(e) => updateLine(i, "credit", parseFloat(e.target.value) || 0)} className="text-red-700" /></div>
                      <div className="col-span-3"><Input placeholder="Description" value={line.description ?? ""} onChange={(e) => updateLine(i, "description", e.target.value)} /></div>
                      <div className="col-span-1"><Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)}><XCircle className="h-4 w-4 text-destructive" /></Button></div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-3 w-3 mr-1" />Ajouter une ligne</Button>
                  <div className="text-xs text-muted-foreground pt-1">Débit: {form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toFixed(3)} | Crédit: {form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toFixed(3)}</div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Création..." : "Créer l'écriture"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries"><FileText className="h-4 w-4 mr-1" />Écritures ({entries.length})</TabsTrigger>
          <TabsTrigger value="balance"><BookOpen className="h-4 w-4 mr-1" />Bilan</TabsTrigger>
          <TabsTrigger value="income"><TrendingUp className="h-4 w-4 mr-1" />Résultat</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {entriesQuery.isLoading
                ? <div className="flex items-center gap-2 py-8 px-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Chargement...</div>
                : (
                <Table>
                  <TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Journal</TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Statut</TableHead>{isAccountant && <TableHead />}</TableRow></TableHeader>
                  <TableBody>
                    {entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-xs">{e.entry_number}</TableCell>
                        <TableCell>{e.journal_code}</TableCell>
                        <TableCell>{e.entry_date}</TableCell>
                        <TableCell className="max-w-xs truncate">{e.description}</TableCell>
                        <TableCell className="text-right text-green-700 tabular-nums">{fmt(e.total_debit)}</TableCell>
                        <TableCell className="text-right text-red-700 tabular-nums">{fmt(e.total_credit)}</TableCell>
                        <TableCell><Badge className={statusBadge(e.status)}>{e.status}</Badge></TableCell>
                        {isAccountant && <TableCell><div className="flex gap-1">{e.status === "draft" && <Button size="sm" variant="ghost" onClick={() => postMutation.mutate(e.id)} title="Valider"><CheckCircle className="h-4 w-4 text-green-600" /></Button>}<Button size="sm" variant="ghost" onClick={() => setDetail(e)}><Eye className="h-4 w-4" /></Button></div></TableCell>}
                      </TableRow>
                    ))}
                    {entries.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucune écriture.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance" className="mt-3">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Bilan comptable</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 max-w-xs"><Label className="whitespace-nowrap">Date de clôture</Label><Input type="date" value={bsDate} onChange={(e) => setBsDate(e.target.value)} /></div>
              {bsQuery.isLoading && <div className="text-sm text-muted-foreground flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calcul...</div>}
              {bsQuery.data && (
                <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Libellé</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Solde</TableHead></TableRow></TableHeader>
                  <TableBody>{bsQuery.data.map((r, i) => <TableRow key={i}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell><Badge variant="outline">{r.account_type}</Badge></TableCell><TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell></TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income" className="mt-3">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Compte de résultat</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">Du</Label><Input type="date" value={isStart} onChange={(e) => setIsStart(e.target.value)} className="max-w-xs" />
                <Label className="whitespace-nowrap">au</Label><Input type="date" value={isEnd}   onChange={(e) => setIsEnd(e.target.value)}   className="max-w-xs" />
              </div>
              {isQuery.isLoading && <div className="text-sm text-muted-foreground flex gap-2"><Loader2 className="h-4 w-4 animate-spin" />Calcul...</div>}
              {isQuery.data && (
                <div className="space-y-3">
                  <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Libellé</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Montant</TableHead></TableRow></TableHeader>
                    <TableBody>{isQuery.data.lines.map((r, i) => <TableRow key={i}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell><Badge className={r.account_type === "produit" ? "bg-green-100 text-green-700 border-0" : "bg-red-100 text-red-700 border-0"}>{r.account_type}</Badge></TableCell><TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "Total charges", val: isQuery.data.summary.total_charges, icon: <TrendingDown className="h-4 w-4 text-red-600" /> }, { label: "Total produits", val: isQuery.data.summary.total_produits, icon: <TrendingUp className="h-4 w-4 text-green-600" /> }, { label: "Résultat net", val: isQuery.data.summary.result, icon: null }].map(({ label, val, icon }) => (
                      <Card key={label}><CardContent className="p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div><div className={`font-semibold tabular-nums mt-1 ${val >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(val)}</div></CardContent></Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Écriture {detail?.entry_number}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-muted-foreground">
                <div>Journal : {detail.journal_name}</div><div>Date : {detail.entry_date}</div>
                <div>Créé par : {detail.created_by_name}</div>{detail.validated_by_name && <div>Validé par : {detail.validated_by_name}</div>}
                {detail.reference && <div>Référence : {detail.reference}</div>}
                <div><Badge className={statusBadge(detail.status)}>{detail.status}</Badge></div>
              </div>
              <p>{detail.description}</p>
              <Table>
                <TableHeader><TableRow><TableHead>Compte</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detail.lines.map((l) => <TableRow key={l.id}><TableCell className="font-mono text-xs">{l.account_code} — {l.account_name}</TableCell><TableCell>{l.description}</TableCell><TableCell className="text-right text-green-700 tabular-nums">{Number(l.debit) > 0 ? fmt(l.debit) : "—"}</TableCell><TableCell className="text-right text-red-700 tabular-nums">{Number(l.credit) > 0 ? fmt(l.credit) : "—"}</TableCell></TableRow>)}
                  <TableRow className="font-semibold border-t"><TableCell colSpan={2} className="text-right">Total</TableCell><TableCell className="text-right text-green-700 tabular-nums">{fmt(detail.total_debit)}</TableCell><TableCell className="text-right text-red-700 tabular-nums">{fmt(detail.total_credit)}</TableCell></TableRow>
                </TableBody>
              </Table>
              {isAccountant && detail.status === "draft" && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { cancelMutation.mutate(detail.id); setDetail(null); }}>Annuler l'écriture</Button>
                  <Button onClick={() => { postMutation.mutate(detail.id); setDetail(null); }}>Valider l'écriture</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
