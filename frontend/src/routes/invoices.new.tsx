import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invoices/new")({
  head: () => ({
    meta: [
      { title: "Create Invoice — Base" },
      { name: "description", content: "Create a new invoice with a live preview." },
    ],
  }),
  component: CreateInvoicePage,
});

interface Line {
  id: number;
  name: string;
  qty: number;
  price: number;
}

function CreateInvoicePage() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("IN020");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: 1, name: "Website Design", qty: 1, price: 800 },
    { id: 2, name: "Hosting (1 year)", qty: 1, price: 120 },
  ]);

  const addLine = () =>
    setLines((l) => [...l, { id: Date.now(), name: "", qty: 1, price: 0 }]);
  const removeLine = (id: number) =>
    setLines((l) => l.filter((x) => x.id !== id));
  const updateLine = (id: number, patch: Partial<Line>) =>
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  const save = () => {
    toast.success("Invoice created", { description: `#${invoiceNo} saved as draft` });
    navigate({ to: "/invoices" });
  };

  return (
    <AppShell
      title="Create New Invoice"
      actions={
        <>
          <Button variant="outline" onClick={() => navigate({ to: "/invoices" })}>
            Cancel
          </Button>
          <Button onClick={save}>Save Invoice</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inv">Invoice No.</Label>
                <Input id="inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="cust">Customer Name</Label>
              <Input id="cust" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <Label htmlFor="addr">Billing Address</Label>
              <Textarea id="addr" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <Label>Products</Label>
                <Button variant="ghost" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4" /> Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_70px_90px_36px] gap-2 items-center">
                    <Input value={l.name} onChange={(e) => updateLine(l.id, { name: e.target.value })} placeholder="Item name" />
                    <Input type="number" min={1} value={l.qty} onChange={(e) => updateLine(l.id, { qty: +e.target.value })} />
                    <Input type="number" min={0} value={l.price} onChange={(e) => updateLine(l.id, { price: +e.target.value })} />
                    <Button variant="ghost" size="icon" onClick={() => removeLine(l.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Payment terms, thanks, etc." />
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="lg:sticky lg:top-24 h-fit">
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-background p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold grid place-items-center">B</div>
                    <span className="font-semibold">Base Inc.</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    22 Kingdom Ave.<br />Cape Town, 8001
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold">Invoice</p>
                  <p className="text-xs text-muted-foreground mt-1">#{invoiceNo}</p>
                  <p className="text-xs text-muted-foreground">{date}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">Billed to</p>
                <p className="text-sm font-medium">{customer || "—"}</p>
                <p className="text-xs text-muted-foreground">{email || "—"}</p>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{address || "—"}</p>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 text-xs text-muted-foreground pb-2 border-b">
                  <span>Item</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Total</span>
                </div>
                {lines.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_60px_80px_80px] gap-2 py-2 text-sm border-b last:border-0">
                    <span>{l.name || "—"}</span>
                    <span className="text-right">{l.qty}</span>
                    <span className="text-right">${l.price}</span>
                    <span className="text-right">${l.qty * l.price}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax (10%)</span><span>${tax.toFixed(2)}</span></div>
                <div className="flex justify-between pt-2 border-t font-semibold text-base">
                  <span>Total</span><span>${total.toFixed(2)}</span>
                </div>
              </div>

              {notes && <p className="text-xs text-muted-foreground border-t pt-3">{notes}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
