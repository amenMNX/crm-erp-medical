import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Star } from "lucide-react";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products — Base" },
      { name: "description", content: "Manage your product catalog." },
    ],
  }),
  component: ProductsPage,
});

const products = [
  { id: 1, name: "Aurora Headphones", sku: "AUR-001", price: "$189", stock: 42, rating: 4.8, status: "Active", color: "from-purple-400 to-pink-400" },
  { id: 2, name: "Nimbus Speaker", sku: "NIM-014", price: "$129", stock: 12, rating: 4.5, status: "Active", color: "from-sky-400 to-indigo-400" },
  { id: 3, name: "Pulse Watch", sku: "PLS-023", price: "$249", stock: 0, rating: 4.9, status: "Out of stock", color: "from-emerald-400 to-teal-400" },
  { id: 4, name: "Loop Earbuds", sku: "LOP-101", price: "$79", stock: 88, rating: 4.3, status: "Active", color: "from-orange-400 to-red-400" },
  { id: 5, name: "Kite Camera", sku: "KTE-330", price: "$599", stock: 5, rating: 4.7, status: "Low stock", color: "from-fuchsia-400 to-rose-400" },
  { id: 6, name: "Halo Lamp", sku: "HLO-220", price: "$59", stock: 120, rating: 4.2, status: "Active", color: "from-yellow-400 to-orange-400" },
  { id: 7, name: "Drift Backpack", sku: "DRF-410", price: "$139", stock: 24, rating: 4.6, status: "Active", color: "from-slate-400 to-slate-600" },
  { id: 8, name: "Echo Mic", sku: "ECH-509", price: "$219", stock: 9, rating: 4.4, status: "Low stock", color: "from-violet-400 to-purple-600" },
];

function statusVariant(s: string) {
  if (s === "Active") return "bg-success/15 text-success border-0";
  if (s === "Low stock") return "bg-warning/15 text-warning border-0";
  return "bg-destructive/15 text-destructive border-0";
}

function ProductsPage() {
  return (
    <AppShell
      title="Products"
      actions={
        <Button>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      }
    >
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products..." className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className={`h-32 bg-gradient-to-br ${p.color}`} />
            <CardContent className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku}</p>
                </div>
                <Badge className={statusVariant(p.status)}>{p.status}</Badge>
              </div>
              <div className="flex items-center justify-between pt-1">
                <p className="text-lg font-bold">{p.price}</p>
                <div className="flex items-center gap-1 text-sm">
                  <Star className="h-4 w-4 fill-warning text-warning" />
                  {p.rating}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Stock: {p.stock}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
