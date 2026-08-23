import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listProtocols,
  getProtocol,
  createProtocol,
  updateProtocol,
  submitForApproval,
  approveProtocol,
  rejectProtocol,
  archiveProtocol,
  cloneProtocol,
  type TreatmentProtocol,
  type ProtocolStatus,
  type RadiationType,
  type FractionInterval,
  RADIATION_LABELS,
  INTERVAL_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/protocols-api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/app-shell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Archive,
  Copy,
  Send,
  Zap,
  ChevronRight,
  History,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/protocols")({
  component: ProtocolsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProtocolStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

type ProtocolFormValues = {
  name: string;
  icd10_code: string;
  icd10_label: string;
  cancer_type: string;
  radiation_type: RadiationType;
  total_dose_gy: string;
  dose_per_fraction_gy: string;
  number_of_fractions: number;
  fraction_interval: FractionInterval;
  total_duration_days: number;
  international_reference: string;
  description: string;
  preparation_instructions: string;
  contraindications: string;
};

const EMPTY_FORM: ProtocolFormValues = {
  name: "",
  icd10_code: "",
  icd10_label: "",
  cancer_type: "",
  radiation_type: "photon",
  total_dose_gy: "",
  dose_per_fraction_gy: "",
  number_of_fractions: 0,
  fraction_interval: "daily",
  total_duration_days: 0,
  international_reference: "",
  description: "",
  preparation_instructions: "",
  contraindications: "",
};

// ─── Drawer détail ────────────────────────────────────────────────────────────

function ProtocolDrawer({
  protocolId,
  onClose,
  onAction,
}: {
  protocolId: number;
  onClose: () => void;
  onAction: () => void;
}) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: proto, isLoading } = useQuery({
    queryKey: ["protocol", protocolId],
    queryFn: () => getProtocol(protocolId),
  });

  const submitMut = useMutation({
    mutationFn: () => submitForApproval(protocolId),
    onSuccess: () => {
      toast.success("Soumis pour approbation");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      qc.invalidateQueries({ queryKey: ["protocol", protocolId] });
    },
    onError: () => toast.error("Erreur lors de la soumission"),
  });

  const approveMut = useMutation({
    mutationFn: () => approveProtocol(protocolId, comment),
    onSuccess: () => {
      toast.success("Protocole approuvé");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      qc.invalidateQueries({ queryKey: ["protocol", protocolId] });
      setComment("");
    },
    onError: () => toast.error("Erreur lors de l'approbation"),
  });

  const rejectMut = useMutation({
    mutationFn: () => rejectProtocol(protocolId, comment),
    onSuccess: () => {
      toast.warning("Protocole renvoyé en brouillon");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      qc.invalidateQueries({ queryKey: ["protocol", protocolId] });
      setRejectOpen(false);
      setComment("");
    },
    onError: () => toast.error("Erreur lors du rejet"),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveProtocol(protocolId),
    onSuccess: () => {
      toast.success("Protocole archivé");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      onAction();
    },
    onError: () => toast.error("Erreur lors de l'archivage"),
  });

  const cloneMut = useMutation({
    mutationFn: () => cloneProtocol(protocolId),
    onSuccess: () => {
      toast.success("Nouvelle version créée");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      onAction();
    },
    onError: () => toast.error("Erreur lors de la duplication"),
  });

  const updateMut = useMutation({
    mutationFn: (data: ProtocolFormValues) =>
      updateProtocol(protocolId, {
        ...data,
        total_dose_gy: Number(data.total_dose_gy),
        dose_per_fraction_gy: Number(data.dose_per_fraction_gy),
      }),
    onSuccess: () => {
      toast.success("Protocole mis à jour");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      qc.invalidateQueries({ queryKey: ["protocol", protocolId] });
      setEditOpen(false);
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  if (isLoading || !proto) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Chargement…
      </div>
    );
  }

  // Computed total dose check
  const totalComp =
    Number(proto.dose_per_fraction_gy) * proto.number_of_fractions;
  const declaredTotal = Number(proto.total_dose_gy);
  const doseDiscrepancy =
    declaredTotal > 0 && Math.abs(totalComp - declaredTotal) > 0.01;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground font-mono">
              {proto.icd10_code}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {proto.cancer_type}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-tight">{proto.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={proto.status} />
            <span className="text-xs text-muted-foreground">
              v{proto.version}
            </span>
            {proto.versions_count > 1 && (
              <span className="text-xs text-muted-foreground">
                · {proto.versions_count} versions
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {proto.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              Modifier
            </Button>
          )}
          {proto.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Soumettre
            </Button>
          )}
          {proto.status === "pending" && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Approuver
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Rejeter
              </Button>
            </>
          )}
          {proto.status === "approved" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cloneMut.mutate()}
                disabled={cloneMut.isPending}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Nouvelle version
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-slate-600"
                onClick={() => archiveMut.mutate()}
                disabled={archiveMut.isPending}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                Archiver
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Commentaire approbation */}
      {proto.status === "pending" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Commentaire (optionnel)</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Motif d'approbation ou de rejet…"
            rows={2}
            className="text-sm"
          />
        </div>
      )}

      <Separator />

      {/* Dosimétrie */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-amber-500" />
          Dosimétrie
        </h3>
        {doseDiscrepancy && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Écart de dose détecté : {totalComp.toFixed(2)} Gy calculé vs{" "}
            {declaredTotal.toFixed(2)} Gy déclaré
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Dose totale</dt>
            <dd className="font-medium">{proto.total_dose_gy} Gy</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Dose/fraction</dt>
            <dd className="font-medium">{proto.dose_per_fraction_gy} Gy</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">
              Nombre de fractions
            </dt>
            <dd className="font-medium">{proto.number_of_fractions}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Intervalle</dt>
            <dd className="font-medium">
              {INTERVAL_LABELS[proto.fraction_interval]}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Type de radiation</dt>
            <dd className="font-medium">
              {RADIATION_LABELS[proto.radiation_type]}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Durée totale</dt>
            <dd className="font-medium">
              {proto.computed_duration_days || proto.total_duration_days} jours
            </dd>
          </div>
        </dl>
      </div>

      {/* Informations cliniques */}
      {(proto.description ||
        proto.preparation_instructions ||
        proto.contraindications) && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Informations cliniques</h3>
            {proto.description && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Description
                </p>
                <p className="text-sm whitespace-pre-line">{proto.description}</p>
              </div>
            )}
            {proto.preparation_instructions && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Préparation
                </p>
                <p className="text-sm whitespace-pre-line">
                  {proto.preparation_instructions}
                </p>
              </div>
            )}
            {proto.contraindications && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Contre-indications
                </p>
                <p className="text-sm whitespace-pre-line text-red-700">
                  {proto.contraindications}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Référence internationale */}
      {proto.international_reference && (
        <>
          <Separator />
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">
              Référence internationale
            </p>
            <p className="text-sm">{proto.international_reference}</p>
          </div>
        </>
      )}

      {/* Approbation */}
      {proto.approved_by_name && proto.approved_at && (
        <>
          <Separator />
          <div className="text-xs text-muted-foreground">
            Approuvé par{" "}
            <span className="font-medium text-foreground">
              {proto.approved_by_name}
            </span>{" "}
            le{" "}
            {new Date(proto.approved_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        </>
      )}

      {/* Changelog */}
      {proto.changelog && proto.changelog.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              Historique des modifications
            </h3>
            <div className="space-y-2">
              {proto.changelog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border px-3 py-2 text-xs"
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-muted-foreground">
                      {entry.performed_by_name} ·{" "}
                      {new Date(entry.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  {entry.comment && (
                    <p className="text-muted-foreground">{entry.comment}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier le protocole</DialogTitle>
          </DialogHeader>
          <ProtocolForm
            initial={{
              name: proto.name,
              icd10_code: proto.icd10_code,
              icd10_label: proto.icd10_label,
              cancer_type: proto.cancer_type,
              radiation_type: proto.radiation_type,
              total_dose_gy: proto.total_dose_gy,
              dose_per_fraction_gy: proto.dose_per_fraction_gy,
              number_of_fractions: proto.number_of_fractions,
              fraction_interval: proto.fraction_interval,
              total_duration_days: proto.total_duration_days,
              international_reference: proto.international_reference,
              description: proto.description,
              preparation_instructions: proto.preparation_instructions,
              contraindications: proto.contraindications,
            }}
            onSave={(data) => updateMut.mutate(data)}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Reject confirm */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter le protocole ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le protocole sera renvoyé en brouillon. Le commentaire ci-dessus
              sera consigné dans l'historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => rejectMut.mutate()}
            >
              Confirmer le rejet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Formulaire création / édition ────────────────────────────────────────────

function ProtocolForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ProtocolFormValues>;
  onSave: (data: ProtocolFormValues) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProtocolFormValues>(
    ({ ...EMPTY_FORM, ...initial } as ProtocolFormValues)
  );

  const set = <K extends keyof ProtocolFormValues>(
    field: K,
    value: ProtocolFormValues[K]
  ) => setForm((prev) => ({ ...prev, [field]: value }));

  // Computed total from fractions
  const computed =
    Number(form.dose_per_fraction_gy) * Number(form.number_of_fractions);

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Identification */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Nom du protocole *</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="ex. SBRT Poumon 3 × 15 Gy"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Code CIM-10</Label>
          <Input
            value={form.icd10_code}
            onChange={(e) => set("icd10_code", e.target.value)}
            placeholder="C34.1"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Libellé CIM-10</Label>
          <Input
            value={form.icd10_label}
            onChange={(e) => set("icd10_label", e.target.value)}
            placeholder="Tumeur maligne du lobe supérieur…"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Type de cancer</Label>
          <Input
            value={form.cancer_type}
            onChange={(e) => set("cancer_type", e.target.value)}
            placeholder="Cancer du poumon CBNPC stade III"
          />
        </div>
      </div>

      <Separator />

      {/* Dosimétrie */}
      <div>
        <p className="text-xs font-semibold mb-2">Dosimétrie</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Type de radiation</Label>
            <Select
              value={form.radiation_type}
              onValueChange={(v) => set("radiation_type", v as RadiationType)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RADIATION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dose/fraction (Gy)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.dose_per_fraction_gy}
              onChange={(e) => set("dose_per_fraction_gy", e.target.value)}
              placeholder="2.00"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre de fractions</Label>
            <Input
              type="number"
              min="1"
              value={form.number_of_fractions || ""}
              onChange={(e) =>
                set("number_of_fractions", Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Dose totale déclarée (Gy)
              {computed > 0 && (
                <span className="ml-1 text-muted-foreground">
                  · calculé : {computed.toFixed(2)} Gy
                </span>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.total_dose_gy}
              onChange={(e) => set("total_dose_gy", e.target.value)}
              placeholder={computed > 0 ? computed.toFixed(2) : "0.00"}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Intervalle</Label>
            <Select
              value={form.fraction_interval}
              onValueChange={(v) => set("fraction_interval", v as FractionInterval)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERVAL_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Durée totale (jours)</Label>
            <Input
              type="number"
              min="1"
              value={form.total_duration_days || ""}
              onChange={(e) =>
                set("total_duration_days", Number(e.target.value))
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Clinique */}
      <div className="space-y-3">
        <p className="text-xs font-semibold">Informations cliniques</p>
        <div className="space-y-1">
          <Label className="text-xs">Référence internationale</Label>
          <Input
            value={form.international_reference}
            onChange={(e) => set("international_reference", e.target.value)}
            placeholder="NCCN 2024, ESTRO guidelines…"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instructions de préparation</Label>
          <Textarea
            rows={2}
            value={form.preparation_instructions}
            onChange={(e) => set("preparation_instructions", e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Contre-indications</Label>
          <Textarea
            rows={2}
            value={form.contraindications}
            onChange={(e) => set("contraindications", e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} size="sm">
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={!form.name.trim()}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────

function ProtocolsPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProtocolStatus | "all">(
    "all"
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // ─── Data ────────────────────────────────────────────────────────────────
  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ["protocols", statusFilter],
    queryFn: () =>
      listProtocols(
        statusFilter !== "all"
          ? { status: statusFilter }
          : { include_archived: true }
      ),
  });

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      createProtocol({
        ...data,
        total_dose_gy: Number(data.total_dose_gy),
        dose_per_fraction_gy: Number(data.dose_per_fraction_gy),
      }),
    onSuccess: () => {
      toast.success("Protocole créé (brouillon)");
      qc.invalidateQueries({ queryKey: ["protocols"] });
      setCreateOpen(false);
    },
    onError: () => toast.error("Erreur lors de la création"),
  });

  // ─── Filtres locaux ──────────────────────────────────────────────────────
  const filtered = protocols.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.icd10_code.toLowerCase().includes(q) ||
      p.cancer_type.toLowerCase().includes(q)
    );
  });

  // ─── Stats rapides ───────────────────────────────────────────────────────
  const counts = {
    all: protocols.length,
    draft: protocols.filter((p) => p.status === "draft").length,
    pending: protocols.filter((p) => p.status === "pending").length,
    approved: protocols.filter((p) => p.status === "approved").length,
    archived: protocols.filter((p) => p.status === "archived").length,
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Protocoles de traitement
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Référentiels de radiothérapie — workflow validation médicale
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            Nouveau protocole
          </Button>
        </div>

        {/* ─── Filtres ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "draft", "pending", "approved", "archived"] as const).map(
              (s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all"
                    ? `Tous (${counts.all})`
                    : `${STATUS_LABELS[s]} (${counts[s]})`}
                </Button>
              )
            )}
          </div>
        </div>

        {/* ─── Table ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          <div
            className={`flex-1 overflow-auto ${selectedId ? "border-r" : ""}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Protocole</TableHead>
                  <TableHead>CIM-10</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dose totale</TableHead>
                  <TableHead>Fractions</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-10 text-sm"
                    >
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-10 text-sm"
                    >
                      Aucun protocole
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedId === p.id ? "bg-muted/60" : ""
                      }`}
                      onClick={() =>
                        setSelectedId(selectedId === p.id ? null : p.id)
                      }
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{p.name}</div>
                        {p.cancer_type && (
                          <div className="text-xs text-muted-foreground">
                            {p.cancer_type}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.icd10_code}
                      </TableCell>
                      <TableCell className="text-sm">
                        {RADIATION_LABELS[p.radiation_type]}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.total_dose_gy} Gy
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.number_of_fractions} × {p.dose_per_fraction_gy} Gy
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(p.id);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* ─── Drawer latéral ──────────────────────────────────────────────── */}
          {selectedId && (
            <div className="w-[420px] overflow-y-auto p-5 shrink-0">
              <ProtocolDrawer
                key={selectedId}
                protocolId={selectedId}
                onClose={() => setSelectedId(null)}
                onAction={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>

        {/* ─── Dialog création ─────────────────────────────────────────────── */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nouveau protocole</DialogTitle>
            </DialogHeader>
            <ProtocolForm
              onSave={(data) => createMut.mutate(data)}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}