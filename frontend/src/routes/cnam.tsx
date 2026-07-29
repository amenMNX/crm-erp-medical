import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createCNAMClaim,
  deleteCNAMClaim,
  fetchCNAMClaims,
  type CNAMStatus,
} from "@/lib/cnam-api";
import { fetchPatients } from "@/lib/patients-api";
import { fetchInvoices } from "@/lib/invoices-api";

export const Route = createFileRoute("/cnam")({
  component: CNAMPage,
});

const statuses: CNAMStatus[] = ["En attente", "Approuvée", "Rejetée", "Remboursée"];

function statusVariant(status: CNAMStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Approuvée" || status === "Remboursée") return "default";
  if (status === "Rejetée") return "destructive";
  return "secondary";
}

function formatMoney(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num.toFixed(2)} DT` : value;
}

function CNAMPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const claimsQuery = useQuery({ queryKey: ["cnam-claims"], queryFn: fetchCNAMClaims });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  const claims = claimsQuery.data ?? [];
  const patients = patientsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createCNAMClaim,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cnam-claims"] });
      setOpen(false);
      setFormError(null);
      toast.success("Dossier CNAM créé");
    },
    onError: () => setFormError("Échec de la création du dossier. Vérifiez les champs saisis."),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCNAMClaim,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cnam-claims"] });
      toast.success("Dossier CNAM supprimé");
    },
  });

  const filteredClaims = useMemo(() => {
    const q = query.trim().toLowerCase();
    return claims.filter(
      (claim) =>
        !q ||
        claim.cnam_number.toLowerCase().includes(q) ||
        claim.patient_name.toLowerCase().includes(q) ||
        claim.invoice_number.toLowerCase().includes(q),
    );
  }, [claims, query]);

  function addClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const patient = Number(formData.get("patient"));
    const invoice = Number(formData.get("invoice"));
    const cnamNumber = String(formData.get("cnamNumber") ?? "").trim();
    const status = String(formData.get("status") ?? "En attente") as CNAMStatus;
    const amountClaimed = String(formData.get("amountClaimed") ?? "").trim();
    const amountReimbursed = String(formData.get("amountReimbursed") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!patient || !invoice || !cnamNumber) {
      setFormError("Patient, facture et numéro CNAM sont obligatoires.");
      return;
    }

    createMutation.mutate({
      patient,
      invoice,
      cnam_number: cnamNumber,
      status,
      amount_claimed: amountClaimed || "0.00",
      amount_reimbursed: amountReimbursed || "0.00",
      notes,
    });
  }

  const isLoading = claimsQuery.isLoading || patientsQuery.isLoading || invoicesQuery.isLoading;
  const loadError = claimsQuery.error || patientsQuery.error || invoicesQuery.error;

  return (
    <AppShell
      title="CNAM"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nouveau dossier
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addClaim} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Nouveau dossier CNAM</DialogTitle>
              </DialogHeader>

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="patient">Patient</Label>
                  <Select name="patient" required>
                    <SelectTrigger id="patient">
                      <SelectValue placeholder="Sélectionner un patient" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={String(patient.id)}>
                          {patient.first_name} {patient.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="invoice">Facture</Label>
                  <Select name="invoice" required>
                    <SelectTrigger id="invoice">
                      <SelectValue placeholder="Sélectionner une facture" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={String(invoice.id)}>
                          {invoice.invoice_number} — {invoice.patient_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cnamNumber">Numéro CNAM</Label>
                  <Input id="cnamNumber" name="cnamNumber" placeholder="ex. CNAM-2026-001" required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="amountClaimed">Montant réclamé</Label>
                    <Input id="amountClaimed" name="amountClaimed" type="number" step="0.01" min="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amountReimbursed">Montant remboursé</Label>
                    <Input id="amountReimbursed" name="amountReimbursed" type="number" step="0.01" min="0" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">Statut</Label>
                  <Select name="status" defaultValue="En attente">
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes">Notes (optionnel)</Label>
                  <Input id="notes" name="notes" placeholder="Remarques sur le dossier" />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Enregistrement..." : "Créer le dossier"}
                </Button>
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
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un dossier CNAM..."
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des dossiers CNAM...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Impossible de charger les dossiers CNAM. Veuillez rafraîchir la page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° CNAM</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Facture</TableHead>
                    <TableHead>Réclamé</TableHead>
                    <TableHead>Remboursé</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.cnam_number}</TableCell>
                      <TableCell>{claim.patient_name}</TableCell>
                      <TableCell className="text-muted-foreground">{claim.invoice_number}</TableCell>
                      <TableCell>{formatMoney(claim.amount_claimed)}</TableCell>
                      <TableCell>{formatMoney(claim.amount_reimbursed)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(claim.status)}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(claim.id)}
                          aria-label={`Supprimer le dossier ${claim.cnam_number}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredClaims.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        Aucun dossier CNAM pour le moment.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
