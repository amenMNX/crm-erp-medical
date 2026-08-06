// /tmp/project/src/routes/invoices.$invoiceId.tsx
// Version améliorée avec gestion individuelle des lignes

import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInvoice,
  fetchInvoice,
  updateInvoice,
  type InvoiceStatus,
} from "@/lib/invoices-api";
import {
  createInvoiceLineItem,
  deleteInvoiceLineItem,
  updateInvoiceLineItem,
  type ApiInvoiceLineItem,
  type InvoiceLineItemWritePayload,
} from "@/lib/invoice-line-items-api";
import { fetchAllPatients } from "@/lib/patients-api";
import { fetchPayments } from "@/lib/payments-api";

export const Route = createFileRoute("/invoices/$invoiceId")({
  head: () => ({
    meta: [{ title: "Edit Invoice — Base" }],
  }),
  component: EditInvoicePage,
});

const statuses: InvoiceStatus[] = ["draft", "issued", "paid", "cancelled"];

function statusLabel(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function methodLabel(method: string) {
  if (method === "bank_transfer") return "Bank Transfer";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function formatMoney(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? `${num.toFixed(2)} TND` : String(value);
}

function EditInvoicePage() {
  const { invoiceId } = Route.useParams();
  const id = Number(invoiceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Queries ────────────────────────────────────────────────────────────────
  const invoiceQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoice(id),
  });
  const patientsQuery = useQuery({
    queryKey: ["patients-all"],
    queryFn: fetchAllPatients,
  });
  const paymentsQuery = useQuery({
    queryKey: ["payments", id],
    queryFn: () => fetchPayments(id),
  });

  const patients = patientsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const invoice = invoiceQuery.data;

  // ── State ──────────────────────────────────────────────────────────────────
  const [patientId, setPatientId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Line item form state
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<ApiInvoiceLineItem | null>(null);
  const [lineForm, setLineForm] = useState({
    description: "",
    quantity: 1,
    unit_price: 0,
    tax_rate: 19,
  });

  // ── Hydration ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (invoice && !hydrated) {
      setPatientId(String(invoice.patient));
      setInvoiceNo(invoice.invoice_number);
      setIssueDate(invoice.issue_date);
      setDueDate(invoice.due_date ?? "");
      setStatus(invoice.status);
      setNotes(invoice.notes);
      setHydrated(true);
    }
  }, [invoice, hydrated]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateInvoice>[1]) =>
      updateInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Facture mise à jour");
    },
    onError: () => setFormError("Erreur lors de la mise à jour."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Facture supprimée");
      navigate({ to: "/invoices" });
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  // ── Line item mutations ────────────────────────────────────────────────────
  const createLineMut = useMutation<ApiInvoiceLineItem, unknown, InvoiceLineItemWritePayload>({
    mutationFn: createInvoiceLineItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      setIsAddingLine(false);
      setLineForm({ description: "", quantity: 1, unit_price: 0, tax_rate: 19 });
      toast.success("Ligne ajoutée");
    },
    onError: () => toast.error("Erreur lors de l'ajout de la ligne"),
  });

  const updateLineMut = useMutation<ApiInvoiceLineItem, unknown, { id: number; data: Partial<InvoiceLineItemWritePayload> }>({
    mutationFn: ({ id: lineId, data }) => updateInvoiceLineItem(lineId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      setEditingLine(null);
      toast.success("Ligne mise à jour");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const deleteLineMut = useMutation<void, unknown, number>({
    mutationFn: deleteInvoiceLineItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Ligne supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────
  const isDraft = status === "draft";

  const handleAddLine = () => {
    createLineMut.mutate({
      invoice: id,
      description: lineForm.description,
      quantity: lineForm.quantity,
      unit_price: lineForm.unit_price,
      tax_rate: lineForm.tax_rate,
    });
  };

  const handleUpdateLine = () => {
    if (!editingLine) return;
    updateLineMut.mutate({
      id: editingLine.id,
      data: {
        description: lineForm.description,
        quantity: lineForm.quantity,
        unit_price: lineForm.unit_price,
        tax_rate: lineForm.tax_rate,
      },
    });
  };

  const openEditLine = (line: ApiInvoiceLineItem) => {
    setEditingLine(line);
    setLineForm({
      description: line.description,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      tax_rate: Number(line.tax_rate),
    });
  };

  const save = () => {
    setFormError(null);

    if (!patientId || !issueDate) {
      setFormError("Le patient et la date d'émission sont obligatoires.");
      return;
    }

    const lineItems = invoice?.line_items ?? [];
    if (lineItems.length === 0) {
      setFormError("Ajoutez au moins une ligne de prestation.");
      return;
    }

    updateMutation.mutate({
      patient: Number(patientId),
      issue_date: issueDate,
      due_date: dueDate || null,
      status,
      notes,
    });
  };

  // ── Loading / Error states ────────────────────────────────────────────────
  const isLoading = invoiceQuery.isLoading || patientsQuery.isLoading;

  if (isLoading) {
    return (
      <AppShell title="Modifier la facture">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      </AppShell>
    );
  }

  if (!invoice) {
    return (
      <AppShell title="Modifier la facture">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Facture non trouvée.
        </div>
      </AppShell>
    );
  }

  const lineItems = invoice.line_items ?? [];
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.line_subtotal), 0);
  const taxAmount = lineItems.reduce((sum, item) => sum + Number(item.line_tax), 0);
  const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.line_total), 0);

  return (
    <AppShell
      title={`Modifier ${invoice.invoice_number}`}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate({ to: "/invoices" })}>
            Retour
          </Button>
          {isDraft && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          )}
          <Button onClick={save} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: Invoice details ────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle>Détails</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>N° facture</Label>
                <Input value={invoiceNo} disabled className="bg-muted font-mono" />
                <p className="text-xs text-muted-foreground mt-1">
                  Généré automatiquement
                </p>
              </div>
              <div>
                <Label>Statut</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date d'émission</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Date d'échéance</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Montant payé</p>
                <p className="text-lg font-semibold">{formatMoney(invoice.paid_amount)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Solde restant</p>
                <p className="text-lg font-semibold">{formatMoney(invoice.balance_due)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Right: Line items ────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Lignes de prestation</CardTitle>
            {isDraft && (
              <Button
                size="sm"
                onClick={() => setIsAddingLine(true)}
                disabled={createLineMut.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {lineItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune ligne de prestation.
                {isDraft && " Ajoutez-en une pour créer la facture."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qté</TableHead>
                    <TableHead className="text-right">Prix unit.</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {isDraft && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.unit_price)}</TableCell>
                      <TableCell className="text-right">{Number(item.tax_rate)}%</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(item.line_total)}
                      </TableCell>
                      {isDraft && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditLine(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Supprimer la ligne</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Cette action est irréversible.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteLineMut.mutate(item.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deleteLineMut.isPending && (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    )}
                                    Supprimer
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}

                  {/* Totals */}
                  <TableRow className="border-t-2 border-border">
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Sous-total
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(subtotal)}
                    </TableCell>
                    {isDraft && <TableCell />}
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right text-muted-foreground">
                      TVA
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(taxAmount)}</TableCell>
                    {isDraft && <TableCell />}
                  </TableRow>
                  <TableRow className="border-t-2 border-border bg-muted/50">
                    <TableCell colSpan={4} className="text-right font-bold">
                      Total TTC
                    </TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {formatMoney(totalAmount)}
                    </TableCell>
                    {isDraft && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Payment History ─────────────────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader><CardTitle>Historique des paiements</CardTitle></CardHeader>
        <CardContent>
          {paymentsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° paiement</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Méthode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.payment_number}</TableCell>
                    <TableCell>{payment.payment_date}</TableCell>
                    <TableCell>{formatMoney(payment.amount)}</TableCell>
                    <TableCell>{methodLabel(payment.method)}</TableCell>
                  </TableRow>
                ))}

                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      Aucun paiement enregistré.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add line dialog ────────────────────────────────────────────────── */}
      <AlertDialog open={isAddingLine} onOpenChange={setIsAddingLine}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajouter une ligne de prestation</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Description</Label>
              <Input
                value={lineForm.description}
                onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
                placeholder="Ex: Séance de radiothérapie"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min="1"
                  value={lineForm.quantity}
                  onChange={(e) => setLineForm({ ...lineForm, quantity: Number(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label>Prix unitaire (TND)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineForm.unit_price}
                  onChange={(e) => setLineForm({ ...lineForm, unit_price: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>TVA (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={lineForm.tax_rate}
                  onChange={(e) => setLineForm({ ...lineForm, tax_rate: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAddLine}
              disabled={createLineMut.isPending || !lineForm.description || lineForm.unit_price <= 0}
            >
              {createLineMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Ajouter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Edit line dialog ────────────────────────────────────────────────── */}
      <AlertDialog open={!!editingLine} onOpenChange={(open) => !open && setEditingLine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier la ligne</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Description</Label>
              <Input
                value={lineForm.description}
                onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Quantité</Label>
                <Input
                  type="number"
                  min="1"
                  value={lineForm.quantity}
                  onChange={(e) => setLineForm({ ...lineForm, quantity: Number(e.target.value) || 1 })}
                />
              </div>
              <div>
                <Label>Prix unitaire (TND)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineForm.unit_price}
                  onChange={(e) => setLineForm({ ...lineForm, unit_price: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>TVA (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={lineForm.tax_rate}
                  onChange={(e) => setLineForm({ ...lineForm, tax_rate: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateLine} disabled={updateLineMut.isPending}>
              {updateLineMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Mettre à jour
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}