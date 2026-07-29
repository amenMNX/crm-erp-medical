import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteInvoice,
  fetchInvoices,
  type ApiInvoice,
  type InvoiceStatus,
} from "@/lib/invoices-api";

export const Route = createFileRoute("/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — Base" },
      { name: "description", content: "Manage all your invoices, statuses and payments." },
    ],
  }),
  component: InvoicesPage,
});

const statuses: InvoiceStatus[] = ["draft", "issued", "paid", "cancelled"];

function statusLabel(status: InvoiceStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusColor(status: InvoiceStatus) {
  if (status === "paid") return "bg-success/15 text-success border-0";
  if (status === "issued") return "bg-warning/15 text-warning border-0";
  if (status === "cancelled") return "bg-destructive/15 text-destructive border-0";
  return "bg-muted text-muted-foreground border-0";
}

function formatMoney(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : value;
}

function InvoicesPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const invoicesQuery = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const invoices = invoicesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
    },
    onError: () => toast.error("Failed to delete invoice"),
  });

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();

    return invoices.filter((invoice: ApiInvoice) => {
      const matchesQuery =
        !q ||
        invoice.invoice_number.toLowerCase().includes(q) ||
        invoice.patient_name.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [invoices, query, statusFilter]);

  return (
    <AppShell
      title="Invoice List"
      actions={
        <Button asChild>
          <Link to="/invoices/new">
            <Plus className="h-4 w-4" /> Add Invoice
          </Link>
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoice..."
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {invoicesQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
            </div>
          )}

          {!invoicesQuery.isLoading && invoicesQuery.error && (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Couldn't load invoices. Please refresh the page.
            </div>
          )}

          {!invoicesQuery.isLoading && !invoicesQuery.error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Balance Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.patient_name}</TableCell>
                    <TableCell className="text-muted-foreground">{invoice.issue_date}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.due_date || "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatMoney(invoice.total_amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMoney(invoice.balance_due)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColor(invoice.status)}>
                        {statusLabel(invoice.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/invoices/$invoiceId" params={{ invoiceId: String(invoice.id) }}>
                            View / Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMutation.mutate(invoice.id)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}