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
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInvoice,
  fetchInvoice,
  updateInvoice,
  type InvoiceStatus,
} from "@/lib/invoices-api";
import { fetchPatients } from "@/lib/patients-api";
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
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : String(value);
}

function EditInvoicePage() {
  const { invoiceId } = Route.useParams();
  const id = Number(invoiceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invoiceQuery = useQuery({ queryKey: ["invoice", id], queryFn: () => fetchInvoice(id) });
  const patientsQuery = useQuery({ queryKey: ["patients"], queryFn: fetchPatients });
  const paymentsQuery = useQuery({ queryKey: ["payments", id], queryFn: () => fetchPayments(id) });

  const patients = patientsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];

  const [patientId, setPatientId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [subtotal, setSubtotal] = useState("0.00");
  const [taxAmount, setTaxAmount] = useState("0.00");
  const [totalAmount, setTotalAmount] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (invoiceQuery.data && !hydrated) {
      const inv = invoiceQuery.data;
      setPatientId(String(inv.patient));
      setInvoiceNo(inv.invoice_number);
      setIssueDate(inv.issue_date);
      setDueDate(inv.due_date ?? "");
      setStatus(inv.status);
      setSubtotal(inv.subtotal);
      setTaxAmount(inv.tax_amount);
      setTotalAmount(inv.total_amount);
      setNotes(inv.notes);
      setHydrated(true);
    }
  }, [invoiceQuery.data, hydrated]);

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateInvoice>[1]) => updateInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Invoice updated");
    },
    onError: () => setFormError("Failed to update invoice. Check the invoice number is unique."),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
      navigate({ to: "/invoices" });
    },
    onError: () => toast.error("Failed to delete invoice"),
  });

  const save = () => {
    setFormError(null);

    if (!patientId || !invoiceNo.trim() || !issueDate) {
      setFormError("Patient, invoice number, and issue date are required.");
      return;
    }

    updateMutation.mutate({
      patient: Number(patientId),
      invoice_number: invoiceNo.trim(),
      issue_date: issueDate,
      due_date: dueDate || null,
      status,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes,
    });
  };

  const isLoading = invoiceQuery.isLoading || patientsQuery.isLoading;

  if (isLoading) {
    return (
      <AppShell title="Edit Invoice">
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice...
        </div>
      </AppShell>
    );
  }

  if (invoiceQuery.error || !invoiceQuery.data) {
    return (
      <AppShell title="Edit Invoice">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn't load this invoice. It may have been deleted.
        </div>
      </AppShell>
    );
  }

  const invoice = invoiceQuery.data;

  return (
    <AppShell
      title={`Edit Invoice ${invoice.invoice_number}`}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate({ to: "/invoices" })}>
            Back
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button onClick={save} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv">Invoice No.</Label>
                <Input id="inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                  <SelectTrigger id="status">
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
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="patient">Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger id="patient">
                  <SelectValue placeholder="Select patient" />
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

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="subtotal">Subtotal</Label>
                <Input id="subtotal" type="number" step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="tax">Tax</Label>
                <Input id="tax" type="number" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="total">Total</Label>
                <Input id="total" type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Paid Amount</p>
                <p className="text-lg font-semibold">{formatMoney(invoice.paid_amount)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className="text-lg font-semibold">{formatMoney(invoice.balance_due)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
          <CardContent>
            {paymentsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading payments...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.payment_number}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.payment_date}</TableCell>
                      <TableCell>{formatMoney(payment.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">{methodLabel(payment.method)}</TableCell>
                    </TableRow>
                  ))}

                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        No payments recorded against this invoice yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              To record a new payment against this invoice, use the <Badge variant="outline">Payments</Badge> page.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}