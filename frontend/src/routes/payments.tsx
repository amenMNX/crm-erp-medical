import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
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
  createPayment,
  deletePayment,
  fetchPayments,
  type PaymentMethod,
} from "@/lib/payments-api";
import { fetchInvoices } from "@/lib/invoices-api";

export const Route = createFileRoute("/payments")({
  component: PaymentsPage,
});

const methods: PaymentMethod[] = ["cash", "card", "bank_transfer", "check"];

function methodLabel(method: PaymentMethod) {
  if (method === "bank_transfer") return "Bank Transfer";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

function formatMoney(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : value;
}

function PaymentsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const paymentsQuery = useQuery({ queryKey: ["payments"], queryFn: () => fetchPayments() });
  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  const payments = paymentsQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: createPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setOpen(false);
      setFormError(null);
      toast.success("Payment recorded");
    },
    onError: () => setFormError("Failed to record payment. Check the payment number is unique."),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment deleted");
    },
  });

  const filteredPayments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter(
      (payment) =>
        !q ||
        payment.payment_number.toLowerCase().includes(q) ||
        payment.invoice_number.toLowerCase().includes(q) ||
        payment.reference.toLowerCase().includes(q),
    );
  }, [payments, query]);

  function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const invoice = Number(formData.get("invoice"));
    const paymentNumber = String(formData.get("paymentNumber") ?? "").trim();
    const paymentDate = String(formData.get("paymentDate") ?? "");
    const amount = String(formData.get("amount") ?? "").trim();
    const method = String(formData.get("method") ?? "cash") as PaymentMethod;
    const reference = String(formData.get("reference") ?? "").trim();

    if (!invoice || !paymentNumber || !paymentDate || !amount) {
      setFormError("Invoice, payment number, date, and amount are required.");
      return;
    }

    createMutation.mutate({
      invoice,
      payment_number: paymentNumber,
      payment_date: paymentDate,
      amount,
      method,
      reference,
    });
  }

  const isLoading = paymentsQuery.isLoading || invoicesQuery.isLoading;
  const loadError = paymentsQuery.error || invoicesQuery.error;

  return (
    <AppShell
      title="Payments"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Record Payment
            </Button>
          </DialogTrigger>

          <DialogContent>
            <form onSubmit={addPayment} className="space-y-5">
              <DialogHeader>
                <DialogTitle>Record a payment</DialogTitle>
              </DialogHeader>

              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="invoice">Invoice</Label>
                  <Select name="invoice" required>
                    <SelectTrigger id="invoice">
                      <SelectValue placeholder="Select invoice" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={String(invoice.id)}>
                          {invoice.invoice_number} — {invoice.patient_name} (due {formatMoney(invoice.balance_due)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="paymentNumber">Payment No.</Label>
                  <Input id="paymentNumber" name="paymentNumber" placeholder="e.g. PMT-001" required />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="paymentDate">Date</Label>
                    <Input id="paymentDate" name="paymentDate" type="date" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount</Label>
                    <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="method">Method</Label>
                  <Select name="method" defaultValue="cash">
                    <SelectTrigger id="method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {methods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {methodLabel(method)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reference">Reference (optional)</Label>
                  <Input id="reference" name="reference" placeholder="Check #, transfer ref, etc." />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : "Record Payment"}
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
              placeholder="Search payment..."
              className="pl-9"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading payments...
            </div>
          )}

          {!isLoading && loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load payments. Please refresh the page.
            </div>
          )}

          {!isLoading && !loadError && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment No.</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.payment_number}</TableCell>
                      <TableCell>{payment.invoice_number}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.payment_date}</TableCell>
                      <TableCell className="font-medium">{formatMoney(payment.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">{methodLabel(payment.method)}</TableCell>
                      <TableCell className="text-muted-foreground">{payment.reference || "—"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(payment.id)}
                          aria-label={`Delete payment ${payment.payment_number}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {filteredPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No payments recorded yet.
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