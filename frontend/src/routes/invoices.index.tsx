import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Search, MoreHorizontal, Download, Filter } from "lucide-react";

export const Route = createFileRoute("/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — Base" },
      { name: "description", content: "Manage all your invoices, statuses and payments." },
    ],
  }),
  component: InvoicesPage,
});

const invoices = [
  { id: "#IN012", customer: "Jesse Thomas", email: "jesse.t@example.com", date: "12 Feb 2024", total: "$248.00", status: "Completed" },
  { id: "#IN013", customer: "Ann Vetrov", email: "ann.vetrov@example.com", date: "13 Feb 2024", total: "$186.00", status: "Pending" },
  { id: "#IN014", customer: "Casey Turner", email: "casey.t@example.com", date: "14 Feb 2024", total: "$92.00", status: "Cancelled" },
  { id: "#IN015", customer: "Sofia Martins", email: "s.martins@example.com", date: "15 Feb 2024", total: "$520.00", status: "Completed" },
  { id: "#IN016", customer: "Nika Kova", email: "nika@example.com", date: "16 Feb 2024", total: "$310.00", status: "Pending" },
  { id: "#IN017", customer: "Marina Lee", email: "marina.lee@example.com", date: "17 Feb 2024", total: "$149.00", status: "Completed" },
  { id: "#IN018", customer: "Fabricio Souza", email: "fabricio@example.com", date: "18 Feb 2024", total: "$88.00", status: "Cancelled" },
  { id: "#IN019", customer: "Riko Hakim", email: "riko.h@example.com", date: "19 Feb 2024", total: "$412.00", status: "Completed" },
];

function statusColor(status: string) {
  if (status === "Completed") return "bg-success/15 text-success border-0";
  if (status === "Pending") return "bg-warning/15 text-warning border-0";
  return "bg-destructive/15 text-destructive border-0";
}

function InvoicesPage() {
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
              <Input placeholder="Search invoice..." className="pl-9" />
            </div>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" /> Filter
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox /></TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell><Checkbox /></TableCell>
                  <TableCell className="font-medium">{i.id}</TableCell>
                  <TableCell>{i.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{i.email}</TableCell>
                  <TableCell className="text-muted-foreground">{i.date}</TableCell>
                  <TableCell className="font-medium">{i.total}</TableCell>
                  <TableCell>
                    <Badge className={statusColor(i.status)}>{i.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
