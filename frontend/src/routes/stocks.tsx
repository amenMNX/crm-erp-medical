import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Archive, Loader2, Package, Plus, Search, ShoppingCart, TrendingDown,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  createEntry, createMovement, createProduct,
  fetchEntries, fetchExpiredEntries, fetchExpiringSoon,
  fetchLowStockProducts, fetchProducts, fetchStockDashboardSummary,
  type MedicalProduct, type StockEntry,
} from "@/lib/stocks-api";

export const Route = createFileRoute("/stocks")({
  component: StocksPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  medication: "Médicament",
  consumable: "Consommable",
  radioactive: "Source radioactive",
  protective: "Protection",
  other: "Autre",
};

const CATEGORY_COLORS: Record<string, string> = {
  medication: "bg-blue-100 text-blue-800",
  consumable: "bg-green-100 text-green-800",
  radioactive: "bg-yellow-100 text-yellow-800",
  protective: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-700",
};

// ── Add Product Dialog ───────────────────────────────────────────────────────
function AddProductDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reference: "", name: "", category: "consumable", unit: "pcs",
    description: "", manufacturer: "",
  });
  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-products"] }); setOpen(false); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="mr-2 h-4 w-4" />Nouveau produit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Ajouter un produit au catalogue</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Référence (SKU) *</Label>
              <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="MED-001" />
            </div>
            <div className="space-y-1">
              <Label>Nom *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nom du produit" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="medication">Médicament</SelectItem>
                  <SelectItem value="consumable">Consommable</SelectItem>
                  <SelectItem value="radioactive">Source radioactive</SelectItem>
                  <SelectItem value="protective">Protection</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unité</Label>
              <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pièce</SelectItem>
                  <SelectItem value="box">Boîte</SelectItem>
                  <SelectItem value="vial">Flacon</SelectItem>
                  <SelectItem value="mg">mg</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="Gy">Gray (Gy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Fabricant</Label>
            <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={!form.reference || !form.name || mutation.isPending} onClick={() => mutation.mutate(form)}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Receive Stock Dialog ─────────────────────────────────────────────────────
function ReceiveStockDialog({ products }: { products: MedicalProduct[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product: "", lot_number: "", received_date: new Date().toISOString().split("T")[0],
    expiry_date: "", quantity_initial: "", unit_cost: "0.00", supplier: "", purchase_order: "", notes: "",
  });
  const mutation = useMutation({
    mutationFn: createEntry,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-entries"] }); qc.invalidateQueries({ queryKey: ["stock-products"] }); qc.invalidateQueries({ queryKey: ["stock-dashboard"] }); setOpen(false); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><ShoppingCart className="mr-2 h-4 w-4" />Réceptionner un lot</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Réception de stock</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Produit *</Label>
            <Select value={form.product} onValueChange={(v) => setForm((f) => ({ ...f, product: v }))}>
              <SelectTrigger><SelectValue placeholder="Sélectionner un produit…" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.reference} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>N° de lot</Label>
              <Input value={form.lot_number} onChange={(e) => setForm((f) => ({ ...f, lot_number: e.target.value }))} placeholder="LOT-2025-001" />
            </div>
            <div className="space-y-1">
              <Label>Quantité reçue *</Label>
              <Input type="number" min="0" step="0.01" value={form.quantity_initial} onChange={(e) => setForm((f) => ({ ...f, quantity_initial: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date de réception</Label>
              <Input type="date" value={form.received_date} onChange={(e) => setForm((f) => ({ ...f, received_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date d'expiration</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fournisseur</Label>
              <Input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Prix unitaire (TND)</Label>
              <Input type="number" step="0.01" min="0" value={form.unit_cost} onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>N° bon de commande</Label>
            <Input value={form.purchase_order} onChange={(e) => setForm((f) => ({ ...f, purchase_order: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={!form.product || !form.quantity_initial || mutation.isPending} onClick={() => mutation.mutate({ ...form, product: Number(form.product), quantity_initial: Number(form.quantity_initial), unit_cost: Number(form.unit_cost) })}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Réceptionner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stock Out Dialog ─────────────────────────────────────────────────────────
function StockOutDialog({ entries }: { entries: StockEntry[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ entry: "", quantity: "", reason: "", reference: "", notes: "" });
  const availableEntries = entries.filter((e) => !e.is_expired && e.quantity_remaining > 0);
  const mutation = useMutation({
    mutationFn: (data: { entry: number; quantity: number; reason: string; reference: string; notes: string; movement_type: string }) =>
      createMovement(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock-entries"] }); qc.invalidateQueries({ queryKey: ["stock-products"] }); qc.invalidateQueries({ queryKey: ["stock-dashboard"] }); setOpen(false); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><TrendingDown className="mr-2 h-4 w-4" />Sortie de stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Enregistrer une sortie de stock</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Lot *</Label>
            <Select value={form.entry} onValueChange={(v) => setForm((f) => ({ ...f, entry: v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir un lot…" /></SelectTrigger>
              <SelectContent>
                {availableEntries.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.product_name} — Lot {e.lot_number || "N/A"} (restant: {e.quantity_remaining} {e.product_unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Quantité à sortir *</Label>
            <Input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Motif</Label>
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Utilisation patient, traitement…" />
          </div>
          <div className="space-y-1">
            <Label>Référence (patient, dossier…)</Label>
            <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button disabled={!form.entry || !form.quantity || mutation.isPending} onClick={() => mutation.mutate({ entry: Number(form.entry), quantity: -Math.abs(Number(form.quantity)), movement_type: "out", reason: form.reason, reference: form.reference, notes: form.notes })}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmer la sortie
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
function StocksPage() {
  const [search, setSearch] = useState("");

  const summaryQ = useQuery({ queryKey: ["stock-dashboard"], queryFn: fetchStockDashboardSummary });
  const productsQ = useQuery({ queryKey: ["stock-products"], queryFn: () => fetchProducts() });
  const entriesQ = useQuery({ queryKey: ["stock-entries"], queryFn: () => fetchEntries() });
  const lowStockQ = useQuery({ queryKey: ["stock-low"], queryFn: fetchLowStockProducts });
  const expiringSoonQ = useQuery({ queryKey: ["stock-expiring"], queryFn: fetchExpiringSoon });
  const expiredQ = useQuery({ queryKey: ["stock-expired"], queryFn: fetchExpiredEntries });

  const products = productsQ.data?.results ?? [];
  const entries = entriesQ.data?.results ?? [];
  const summary = summaryQ.data;

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.reference.toLowerCase().includes(search.toLowerCase()) ||
      p.manufacturer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="h-6 w-6" />
              Gestion des stocks médicaux
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Catalogue produits, réceptions, sorties et alertes de péremption
            </p>
          </div>
          <div className="flex gap-2">
            <StockOutDialog entries={entries} />
            <ReceiveStockDialog products={products} />
            <AddProductDialog />
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Produits actifs</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{summary?.total_active_products ?? "—"}</p></CardContent>
          </Card>
          <Card className={summary?.low_stock_alerts ? "border-orange-300" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Alertes stock bas</CardTitle></CardHeader>
            <CardContent><p className={`text-3xl font-bold ${summary?.low_stock_alerts ? "text-orange-600" : ""}`}>{summary?.low_stock_alerts ?? "—"}</p></CardContent>
          </Card>
          <Card className={summary?.expiring_soon_lots ? "border-yellow-300" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Lots expirant &lt;30j</CardTitle></CardHeader>
            <CardContent><p className={`text-3xl font-bold ${summary?.expiring_soon_lots ? "text-yellow-600" : ""}`}>{summary?.expiring_soon_lots ?? "—"}</p></CardContent>
          </Card>
          <Card className={summary?.expired_lots_with_stock ? "border-red-300" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Lots périmés à rebuter</CardTitle></CardHeader>
            <CardContent><p className={`text-3xl font-bold ${summary?.expired_lots_with_stock ? "text-red-600" : ""}`}>{summary?.expired_lots_with_stock ?? "—"}</p></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="catalogue">
          <TabsList>
            <TabsTrigger value="catalogue">Catalogue produits</TabsTrigger>
            <TabsTrigger value="lots">Lots en stock</TabsTrigger>
            <TabsTrigger value="alertes">
              Alertes
              {(summary?.low_stock_alerts ?? 0) + (summary?.expiring_soon_lots ?? 0) + (summary?.expired_lots_with_stock ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5">
                  {(summary?.low_stock_alerts ?? 0) + (summary?.expiring_soon_lots ?? 0) + (summary?.expired_lots_with_stock ?? 0)}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Catalogue */}
          <TabsContent value="catalogue">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Produits ({filtered.length})</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Référence, nom, fabricant…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {productsQ.isLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Référence</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Fabricant</TableHead>
                        <TableHead className="text-right">Stock actuel</TableHead>
                        <TableHead>Alerte seuil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">{p.reference}</TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[p.category] ?? "bg-gray-100 text-gray-700"}`}>
                              {CATEGORY_LABELS[p.category] ?? p.category}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.manufacturer || "—"}</TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={p.alert?.is_triggered ? "text-orange-600" : ""}>
                              {Number(p.current_stock).toFixed(0)} {p.unit_label}
                            </span>
                          </TableCell>
                          <TableCell>
                            {p.alert?.is_triggered ? (
                              <Badge variant="destructive" className="text-xs">Sous seuil ({p.alert.min_quantity})</Badge>
                            ) : p.alert ? (
                              <span className="text-xs text-muted-foreground">Seuil: {p.alert.min_quantity}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Lots */}
          <TabsContent value="lots">
            <Card>
              <CardHeader><CardTitle>Lots en stock ({entries.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {entriesQ.isLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>N° Lot</TableHead>
                        <TableHead>Réception</TableHead>
                        <TableHead>Expiration</TableHead>
                        <TableHead className="text-right">Initial</TableHead>
                        <TableHead className="text-right">Restant</TableHead>
                        <TableHead>Fournisseur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id} className={e.is_expired ? "opacity-60 bg-red-50" : ""}>
                          <TableCell className="font-medium">{e.product_name}</TableCell>
                          <TableCell className="font-mono text-sm">{e.lot_number || "—"}</TableCell>
                          <TableCell>{e.received_date}</TableCell>
                          <TableCell>
                            {e.expiry_date ? (
                              <span className={e.is_expired ? "text-red-600 font-medium" : (e.days_until_expiry ?? 999) < 30 ? "text-yellow-600 font-medium" : ""}>
                                {e.expiry_date}
                                {e.is_expired && " ⚠️"}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-right">{e.quantity_initial} {e.product_unit}</TableCell>
                          <TableCell className="text-right font-medium">{e.quantity_remaining} {e.product_unit}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{e.supplier || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alertes */}
          <TabsContent value="alertes" className="space-y-4">
            {/* Low stock */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" />Stock bas</CardTitle></CardHeader>
              <CardContent className="p-0">
                {lowStockQ.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : (lowStockQ.data?.length ?? 0) === 0 ? <p className="text-center py-8 text-muted-foreground">Aucun produit sous le seuil</p>
                  : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Produit</TableHead><TableHead className="text-right">Stock actuel</TableHead><TableHead className="text-right">Seuil</TableHead><TableHead>À commander</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStockQ.data?.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name} <span className="text-xs text-muted-foreground ml-1">{p.reference}</span></TableCell>
                            <TableCell className="text-right text-orange-600 font-bold">{Number(p.current_stock).toFixed(0)} {p.unit_label}</TableCell>
                            <TableCell className="text-right">{p.alert?.min_quantity} {p.unit_label}</TableCell>
                            <TableCell>{p.alert?.reorder_quantity} {p.unit_label} — {p.alert?.preferred_supplier || "Fournisseur N/A"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </CardContent>
            </Card>

            {/* Expiring soon */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-yellow-500" />Lots expirant dans 30 jours</CardTitle></CardHeader>
              <CardContent className="p-0">
                {expiringSoonQ.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : (expiringSoonQ.data?.length ?? 0) === 0 ? <p className="text-center py-8 text-muted-foreground">Aucun lot en alerte d'expiration</p>
                  : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Produit</TableHead><TableHead>Lot</TableHead><TableHead>Expiration</TableHead><TableHead className="text-right">Restant</TableHead><TableHead>Jours restants</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {expiringSoonQ.data?.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>{e.product_name}</TableCell>
                            <TableCell className="font-mono text-sm">{e.lot_number || "—"}</TableCell>
                            <TableCell className="text-yellow-700 font-medium">{e.expiry_date}</TableCell>
                            <TableCell className="text-right">{e.quantity_remaining} {e.product_unit}</TableCell>
                            <TableCell><Badge variant="outline" className="text-yellow-700 border-yellow-400">{e.days_until_expiry}j</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </CardContent>
            </Card>

            {/* Expired */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5 text-red-500" />Lots périmés (à mettre au rebut)</CardTitle></CardHeader>
              <CardContent className="p-0">
                {expiredQ.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  : (expiredQ.data?.length ?? 0) === 0 ? <p className="text-center py-8 text-muted-foreground">Aucun lot périmé en stock</p>
                  : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Produit</TableHead><TableHead>Lot</TableHead><TableHead>Expiré le</TableHead><TableHead className="text-right">Restant</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {expiredQ.data?.map((e) => (
                          <TableRow key={e.id} className="bg-red-50">
                            <TableCell>{e.product_name}</TableCell>
                            <TableCell className="font-mono text-sm">{e.lot_number || "—"}</TableCell>
                            <TableCell className="text-red-600 font-medium">{e.expiry_date}</TableCell>
                            <TableCell className="text-right text-red-600">{e.quantity_remaining} {e.product_unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
