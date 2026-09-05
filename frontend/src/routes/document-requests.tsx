import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus, Search, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOC_TYPE_LABELS, type DocRequestType } from "@/lib/document-requests-api";
import { fetchEmployees, type ApiEmployee } from "@/lib/employees-api";
import { getAuthUser } from "@/lib/auth";

export const Route = createFileRoute("/document-requests")({
  head: () => ({ meta: [{ title: "Demandes de documents" }] }),
  component: DocumentRequestsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type DocRequestStatus = "En attente" | "En cours" | "Prêt" | "Refusé";

type LocalDocRequest = {
  id: number;
  employee_number: string;
  employee_name: string;
  document_type: DocRequestType;
  motif: string;
  statut: DocRequestStatus;
  created_at: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "doc-requests-local-v1";

function loadRequests(): LocalDocRequest[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRequests(reqs: LocalDocRequest[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reqs));
}

function statusClass(s: DocRequestStatus) {
  if (s === "Prêt") return "bg-green-100 text-green-700 border-0";
  if (s === "Refusé") return "bg-destructive/15 text-destructive border-0";
  if (s === "En cours") return "bg-blue-100 text-blue-700 border-0";
  return "bg-muted text-muted-foreground border-0";
}

// ── Employee search combobox ──────────────────────────────────────────────────

function EmployeeSearchField({
  employees,
  selected,
  onSelect,
}: {
  employees: ApiEmployee[];
  selected: ApiEmployee | null;
  onSelect: (emp: ApiEmployee | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? employees.filter((e) => {
        const q = query.toLowerCase();
        return (
          e.employee_number.toLowerCase().includes(q) ||
          e.first_name.toLowerCase().includes(q) ||
          e.last_name.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/40">
        <span className="font-medium">{selected.employee_number}</span>
        <span className="text-muted-foreground">—</span>
        <span>{selected.first_name} {selected.last_name}</span>
        <span className="text-xs text-muted-foreground ml-1">({selected.job_title})</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-5 w-5 p-0"
          onClick={() => { onSelect(null); setQuery(""); }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher par numéro (EMP-0002) ou nom…"
          className="pl-9"
          autoComplete="off"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {filtered.map((emp) => (
            <button
              key={emp.id}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-muted text-left"
              onClick={() => { onSelect(emp); setQuery(""); setOpen(false); }}
            >
              <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{emp.employee_number}</span>
              <span className="font-medium">{emp.first_name} {emp.last_name}</span>
              <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">{emp.job_title}</span>
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-3 text-sm text-muted-foreground">
          Aucun employé trouvé.
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function DocumentRequestsPage() {
  const qc = useQueryClient();
  const user = getAuthUser();
  const isHr = user?.role === "hr" || user?.role === "admin" || user?.is_super_admin;

  const empQuery = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees });
  const employees = empQuery.data ?? [];

  const [requests, setRequests] = useState<LocalDocRequest[]>(loadRequests);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Form state
  const [selectedEmployee, setSelectedEmployee] = useState<ApiEmployee | null>(null);
  const [docType, setDocType] = useState<DocRequestType | "">("");
  const [motif, setMotif] = useState("");

  function persist(next: LocalDocRequest[]) {
    setRequests(next);
    saveRequests(next);
  }

  function handleCreate() {
    if (!selectedEmployee || !docType) {
      toast.error("Veuillez sélectionner un employé et un type de document.");
      return;
    }
    const req: LocalDocRequest = {
      id: Date.now(),
      employee_number: selectedEmployee.employee_number,
      employee_name: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      document_type: docType as DocRequestType,
      motif: motif.trim(),
      statut: "En attente",
      created_at: new Date().toISOString(),
    };
    persist([req, ...requests]);
    setOpen(false);
    setSelectedEmployee(null);
    setDocType("");
    setMotif("");
    toast.success("Demande envoyée.");
  }

  function updateStatus(id: number, statut: DocRequestStatus) {
    persist(requests.map((r) => (r.id === id ? { ...r, statut } : r)));
  }

  const filtered = requests.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.employee_name.toLowerCase().includes(q) ||
      r.employee_number.toLowerCase().includes(q) ||
      DOC_TYPE_LABELS[r.document_type]?.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell
      title="Demandes de documents"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle demande
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Demande de document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Employé *</Label>
                {empQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Chargement des employés…
                  </div>
                ) : (
                  <EmployeeSearchField
                    employees={employees}
                    selected={selectedEmployee}
                    onSelect={setSelectedEmployee}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Type de document *</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocRequestType)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Motif (optionnel)</Label>
                <Textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  rows={3}
                  placeholder="Raison de la demande…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={!selectedEmployee || !docType}
              >
                Envoyer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par employé, numéro ou document…"
              className="pl-9"
            />
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Employé</TableHead>
                  <TableHead>Employé</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date</TableHead>
                  {isHr && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.employee_number}
                    </TableCell>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {DOC_TYPE_LABELS[r.document_type] ?? r.document_type}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {r.motif || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusClass(r.statut)}>{r.statut}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.created_at.slice(0, 10)}
                    </TableCell>
                    {isHr && (
                      <TableCell>
                        {r.statut !== "Prêt" && r.statut !== "Refusé" && (
                          <div className="flex gap-2">
                            {r.statut === "En attente" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateStatus(r.id, "En cours")}
                              >
                                En cours
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus(r.id, "Prêt")}
                            >
                              Prêt
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus(r.id, "Refusé")}
                            >
                              Refuser
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={isHr ? 7 : 6}
                      className="text-center py-8 text-sm text-muted-foreground"
                    >
                      Aucune demande.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}