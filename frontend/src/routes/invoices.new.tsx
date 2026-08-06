import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createInvoice, type ApiInvoice } from "@/lib/invoices-api";
import { fetchAllPatients } from "@/lib/patients-api";

export const Route = createFileRoute("/invoices/new")({
  head: () => ({
    meta: [
      { title: "Nouvelle facture — CRM Radiothérapie" },
      { name: "description", content: "Créer une nouvelle facture." },
    ],
  }),
  component: CreateInvoicePage,
});

interface Line {
  id: number;
  description: string;
  qty: number;
  price: number;
  taxRate: number;
}

function CreateInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [patientId, setPatientId]   = useState("");
  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate]       = useState("");
  const [notes, setNotes]           = useState("");
  const [formError, setFormError]   = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<ApiInvoice | null>(null);
  const [lines, setLines] = useState<Line[]>([
    { id: 1, description: "Séance de radiothérapie", qty: 1, price: 500, taxRate: 19 },
    { id: 2, description: "Consultation médicale", qty: 1, price: 150, taxRate: 19 },
  ]);

  // fetchAllPatients returns ApiPatient[] directly — no pagination unwrap needed
  const patientsQuery = useQuery({ queryKey: ["patients-all"], queryFn: fetchAllPatients });
  const patients = patientsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setCreatedInvoice(invoice);
      toast.success("Facture créée", {
        description: `Numéro attribué : ${invoice.invoice_number}`,
      });
      setTimeout(() => navigate({ to: "/invoices" }), 1800);
    },
    onError: (err: Error) =>
      setFormError(err.message || "Impossible de créer la facture."),
  });

  const addLine    = () => setLines((l) => [...l, { id: Date.now(), description: "", qty: 1, price: 0, taxRate: 19 }]);
  const removeLine = (id: number) => setLines((l) => l.filter((x) => x.id !== id));
  const updateLine = (id: number, patch: Partial<Line>) =>
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  const tax      = lines.reduce((sum, l) => sum + (l.qty * l.price * l.taxRate) / 100, 0);
  const total    = subtotal + tax;

  const save = () => {
    setFormError(null);
    if (!patientId || !date) {
      setFormError("Le patient et la date d'émission sont obligatoires.");
      return;
    }
    const validLines = lines.filter((line) => line.description.trim() && line.qty > 0 && line.price >= 0);
    if (validLines.length === 0) {
      setFormError("Ajoutez au moins une ligne de prestation valide.");
      return;
    }
    // invoice_number is NOT sent — backend auto-generates IN-0001, IN-0002, etc.
    createMutation.mutate({
      patient:      Number(patientId),
      issue_date:   date,
      due_date:     dueDate || null,
      status:       "issued",
      line_items:   validLines.map((line) => ({
        description: line.description.trim(),
        quantity: line.qty.toFixed(2),
        unit_price: line.price.toFixed(2),
        tax_rate: line.taxRate.toFixed(2),
      })),
      notes,
    });
  };

  const selectedPatient = patients.find((p) => String(p.id) === patientId);

  return (
    <AppShell
      title="Nouvelle facture"
      actions={
        <>
          <Button variant="outline" onClick={() => navigate({ to: "/invoices" })}>
            Annuler
          </Button>
          <Button onClick={save} disabled={createMutation.isPending || !!createdInvoice}>
            {createMutation.isPending ? "Enregistrement…" : "Créer la facture"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Form ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Détails
              <Badge variant="outline" className="text-xs font-normal">
                Numéro IN-0001 attribué automatiquement
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            {createdInvoice && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                <span>✓ Facture créée —</span>
                <span className="font-mono font-semibold">{createdInvoice.invoice_number}</span>
                <span className="text-muted-foreground">Redirection…</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date">Date d'émission *</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="due">Date d'échéance</Label>
                <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="patient">Patient *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger id="patient">
                  <SelectValue placeholder="Sélectionner un patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.first_name} {p.last_name}
                      {p.medical_record_number && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {p.medical_record_number}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Lignes de prestation</Label>
                <Button variant="ghost" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_60px_90px_70px_36px] gap-2 text-xs text-muted-foreground px-1">
                  <span>Description</span><span className="text-center">Qté</span>
                  <span className="text-right">Prix unit.</span>
                  <span className="text-right">TVA %</span><span />
                </div>
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_60px_90px_70px_36px] gap-2 items-center">
                    <Input
                      value={l.description}
                      onChange={(e) => updateLine(l.id, { description: e.target.value })}
                      placeholder="Description…"
                    />
                    <Input
                      type="number" min={1} value={l.qty}
                      onChange={(e) => updateLine(l.id, { qty: +e.target.value })}
                    />
                    <Input
                      type="number" min={0} value={l.price}
                      onChange={(e) => updateLine(l.id, { price: +e.target.value })}
                    />
                    <Input
                      type="number" min={0} step="0.01" value={l.taxRate}
                      onChange={(e) => updateLine(l.id, { taxRate: +e.target.value })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeLine(l.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes" value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3} placeholder="Conditions de paiement, remarques…"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Preview ── */}
        <Card className="lg:sticky lg:top-24 h-fit">
          <CardHeader><CardTitle>Aperçu</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-background p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">Centre de Radiothérapie</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tunis, Tunisie
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold">Facture</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {createdInvoice?.invoice_number ?? "IN-0001"}
                  </p>
                  <p className="text-xs text-muted-foreground">{date}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">Facturé à</p>
                <p className="text-sm font-medium">
                  {selectedPatient
                    ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedPatient?.medical_record_number ?? ""}
                </p>
                <p className="text-xs text-muted-foreground">{selectedPatient?.email ?? "—"}</p>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-[1fr_48px_72px_56px_72px] gap-2 text-xs text-muted-foreground pb-2 border-b">
                  <span>Prestation</span>
                  <span className="text-center">Qté</span>
                  <span className="text-right">P.U.</span>
                  <span className="text-right">TVA</span>
                  <span className="text-right">Total</span>
                </div>
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_48px_72px_56px_72px] gap-2 py-1.5 text-sm border-b last:border-0">
                    <span>{l.description || "—"}</span>
                    <span className="text-center">{l.qty}</span>
                    <span className="text-right">{l.price.toFixed(2)} DT</span>
                    <span className="text-right">{l.taxRate.toFixed(2)}%</span>
                    <span className="text-right">{(l.qty * l.price * (1 + l.taxRate / 100)).toFixed(2)} DT</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sous-total HT</span>
                  <span>{subtotal.toFixed(2)} DT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TVA</span>
                  <span>{tax.toFixed(2)} DT</span>
                </div>
                <div className="flex justify-between pt-2 border-t font-semibold text-base">
                  <span>Total TTC</span>
                  <span>{total.toFixed(2)} DT</span>
                </div>
              </div>

              {notes && (
                <p className="text-xs text-muted-foreground border-t pt-3">{notes}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
