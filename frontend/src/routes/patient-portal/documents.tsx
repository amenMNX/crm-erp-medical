import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  portalDocuments,
  portalInvoices,
  portalInvoicePdfUrl,
  type PatientDocument,
  type PortalInvoice,
} from "@/lib/patient-portal-api";
import {
  FileText, Download, Filter, Receipt, ChevronDown, ChevronUp,
  Clock, CheckCircle2, XCircle, AlertTriangle, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/patient-portal/documents")({
  component: DocumentsPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "",             label: "Tous" },
  { value: "compte_rendu", label: "Comptes-rendus" },
  { value: "ordonnance",   label: "Ordonnances" },
  { value: "imagerie",     label: "Imagerie" },
  { value: "protocole",    label: "Protocoles" },
  { value: "autre",        label: "Autres" },
];

const TYPE_META: Record<string, { emoji: string; color: string }> = {
  compte_rendu: { emoji: "📄", color: "bg-blue-50 text-blue-700 border-blue-200" },
  ordonnance:   { emoji: "💊", color: "bg-purple-50 text-purple-700 border-purple-200" },
  imagerie:     { emoji: "🔬", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  protocole:    { emoji: "⚡", color: "bg-amber-50 text-amber-700 border-amber-200" },
  autre:        { emoji: "📎", color: "bg-gray-50 text-gray-600 border-gray-200" },
};

const INVOICE_STATUS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  issued:    { label: "En attente",  icon: <Clock className="h-3.5 w-3.5" />,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  paid:      { label: "Payée",       icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Annulée",     icon: <XCircle className="h-3.5 w-3.5" />,      cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

type Tab = "documents" | "factures";

// ─── Page ─────────────────────────────────────────────────────────────────────

function DocumentsPage() {
  const [tab, setTab] = useState<Tab>("documents");

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Documents & Factures
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Consultez et téléchargez vos documents médicaux et factures
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <TabBtn active={tab === "documents"} onClick={() => setTab("documents")}>
          <FileText className="h-4 w-4" /> Documents médicaux
        </TabBtn>
        <TabBtn active={tab === "factures"} onClick={() => setTab("factures")}>
          <Receipt className="h-4 w-4" /> Mes factures
        </TabBtn>
      </div>

      {tab === "documents" && <DocumentsTab />}
      {tab === "factures"  && <FacturesTab />}
    </div>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [docs, setDocs]             = useState<PatientDocument[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    setLoading(true);
    portalDocuments(typeFilter || undefined)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [typeFilter]);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400 shrink-0" />
        {DOC_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setTypeFilter(t.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              typeFilter === t.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-10 w-10" />} message="Aucun document disponible." />
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => {
            const meta = TYPE_META[doc.document_type] ?? { emoji: "📎", color: "bg-gray-50 text-gray-600 border-gray-200" };
            const typeName = DOC_TYPES.find((t) => t.value === doc.document_type)?.label ?? doc.document_type;
            return (
              <div key={doc.id} className="bg-white rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                <div className={`h-10 w-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${meta.color}`}>
                  {meta.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{doc.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${meta.color}`}>{typeName}</span>
                    {doc.file_size_kb > 0 && <span>{doc.file_size_kb} KB</span>}
                    <span>{new Date(doc.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
                    {doc.uploaded_by_name && <span>· {doc.uploaded_by_name}</span>}
                  </div>
                </div>
                <a
                  href={doc.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-2 rounded-xl border border-primary/20 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Factures tab ─────────────────────────────────────────────────────────────

function FacturesTab() {
  const [invoices, setInvoices]       = useState<PortalInvoice[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<number | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => {
    portalInvoices()
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalDue = invoices
    .filter((inv) => inv.status === "issued")
    .reduce((sum, inv) => sum + parseFloat(inv.balance_due), 0);

  async function handleDownloadPdf(inv: PortalInvoice) {
    setDownloading(inv.id);
    try {
      const url = portalInvoicePdfUrl(inv.id);
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error("PDF unavailable");
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `facture-${inv.invoice_number}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: print-to-PDF via browser
      printInvoice(inv);
    } finally {
      setDownloading(null);
    }
  }

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
    </div>
  );

  if (invoices.length === 0) return (
    <EmptyState icon={<Receipt className="h-10 w-10" />} message="Aucune facture disponible." />
  );

  const pendingCount = invoices.filter((i) => i.status === "issued").length;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      {totalDue > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Solde restant dû</p>
            <p className="text-xs text-amber-700">
              {pendingCount} facture{pendingCount > 1 ? "s" : ""} en attente de règlement
            </p>
          </div>
          <p className="text-lg font-bold text-amber-800">{totalDue.toFixed(2)} TND</p>
        </div>
      )}

      <div className="space-y-2">
        {invoices.map((inv) => {
          const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.issued;
          const isExpanded = expanded === inv.id;
          const isOverdue = inv.days_overdue > 0 && inv.status === "issued";

          return (
            <div key={inv.id} className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${isOverdue ? "border-red-200" : ""}`}>
              {/* Main row */}
              <div className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-gray-50 border flex items-center justify-center shrink-0">
                  <Receipt className="h-5 w-5 text-gray-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{inv.invoice_number}</p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>
                      {st.icon}{st.label}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                        {inv.days_overdue}j de retard
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-400 mt-0.5">
                    <span>Émise le {new Date(inv.issue_date).toLocaleDateString("fr-FR")}</span>
                    {inv.due_date && <span>· Échéance {new Date(inv.due_date).toLocaleDateString("fr-FR")}</span>}
                    <span className="font-semibold text-gray-700">{parseFloat(inv.total_amount).toFixed(2)} TND</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleDownloadPdf(inv)}
                    disabled={downloading === inv.id}
                    title="Télécharger PDF"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-2 rounded-xl border border-primary/20 transition-colors disabled:opacity-60"
                  >
                    {downloading === inv.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                    PDF
                  </button>
                  <button
                    onClick={() => setExpanded(isExpanded ? null : inv.id)}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title={isExpanded ? "Réduire" : "Voir le détail"}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t bg-gray-50/70 px-4 py-4 space-y-4">
                  {inv.line_items.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Détail des prestations
                      </p>
                      <div className="bg-white rounded-xl border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500 hidden sm:table-cell">Qté</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500 hidden sm:table-cell">P.U.</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {inv.line_items.map((li, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-2.5 text-gray-700">{li.description}</td>
                                <td className="px-3 py-2.5 text-right text-gray-500 hidden sm:table-cell">{li.quantity}</td>
                                <td className="px-3 py-2.5 text-right text-gray-500 hidden sm:table-cell">{parseFloat(li.unit_price).toFixed(2)} TND</td>
                                <td className="px-3 py-2.5 text-right font-medium text-gray-800">{parseFloat(li.line_total).toFixed(2)} TND</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="space-y-1.5 w-60">
                      <TotalRow label="Sous-total HT" value={`${parseFloat(inv.subtotal).toFixed(2)} TND`} />
                      <TotalRow label="TVA" value={`${parseFloat(inv.tax_amount).toFixed(2)} TND`} />
                      <div className="border-t pt-1.5">
                        <TotalRow label="Total TTC" value={`${parseFloat(inv.total_amount).toFixed(2)} TND`} bold />
                      </div>
                      <TotalRow label="Montant payé" value={`${parseFloat(inv.paid_amount).toFixed(2)} TND`} green />
                      <div className="border-t pt-1.5">
                        <TotalRow
                          label="Solde dû"
                          value={`${parseFloat(inv.balance_due).toFixed(2)} TND`}
                          bold
                          red={parseFloat(inv.balance_due) > 0}
                        />
                      </div>
                    </div>
                  </div>

                  {inv.notes && (
                    <p className="text-xs text-gray-500 bg-white border rounded-xl px-3 py-2.5">
                      <span className="font-semibold text-gray-600">Note : </span>{inv.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Print-to-PDF fallback ────────────────────────────────────────────────────

function printInvoice(inv: PortalInvoice) {
  const stLabel = INVOICE_STATUS[inv.status]?.label ?? inv.status;
  const stBg = inv.status === "paid" ? "#d1fae5" : inv.status === "cancelled" ? "#f3f4f6" : "#fef3c7";
  const stColor = inv.status === "paid" ? "#065f46" : inv.status === "cancelled" ? "#6b7280" : "#92400e";
  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Facture ${inv.invoice_number}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Arial', sans-serif; max-width: 680px; margin: 40px auto; color: #111; font-size: 13px; line-height: 1.5; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      h1 { font-size: 28px; font-weight: 800; color: #111; }
      .invoice-num { font-size: 15px; color: #555; margin-top: 4px; }
      .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; background:${stBg}; color:${stColor}; }
      .meta { color: #666; font-size: 12px; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; margin: 24px 0; }
      th { background: #f5f5f5; text-align: left; padding: 10px 12px; border-bottom: 2px solid #e5e5e5; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
      td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; color: #333; }
      td:last-child, th:last-child { text-align: right; }
      td:not(:first-child), th:not(:first-child) { text-align: right; }
      .totals-table { width: 240px; float: right; margin-top: 8px; }
      .totals-table td { border: none; padding: 4px 0; font-size: 12px; }
      .totals-table td:last-child { font-weight: 600; }
      .total-final td { font-size: 14px; font-weight: 800; border-top: 2px solid #111; padding-top: 8px; }
      .total-due td { color: ${parseFloat(inv.balance_due) > 0 ? "#dc2626" : "#059669"}; }
      .notes { clear: both; margin-top: 48px; padding: 12px 16px; background: #f9f9f9; border-radius: 8px; font-size: 12px; color: #666; }
      @media print { body { margin: 20px; } }
    </style></head><body>
    <div class="header">
      <div>
        <h1>Facture</h1>
        <div class="invoice-num">${inv.invoice_number}</div>
      </div>
      <div style="text-align:right">
        <div class="badge">${stLabel}</div>
        <div class="meta">Émise le ${new Date(inv.issue_date).toLocaleDateString("fr-FR")}${inv.due_date ? `<br>Échéance ${new Date(inv.due_date).toLocaleDateString("fr-FR")}` : ""}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Qté</th><th>P.U. HT</th><th>Total TTC</th></tr></thead>
      <tbody>
        ${inv.line_items.map((li) => `
          <tr>
            <td>${li.description}</td>
            <td>${li.quantity}</td>
            <td>${parseFloat(li.unit_price).toFixed(2)} TND</td>
            <td>${parseFloat(li.line_total).toFixed(2)} TND</td>
          </tr>`).join("")}
      </tbody>
    </table>
    <table class="totals-table">
      <tr><td>Sous-total HT</td><td>${parseFloat(inv.subtotal).toFixed(2)} TND</td></tr>
      <tr><td>TVA</td><td>${parseFloat(inv.tax_amount).toFixed(2)} TND</td></tr>
      <tr class="total-final"><td>Total TTC</td><td>${parseFloat(inv.total_amount).toFixed(2)} TND</td></tr>
      <tr><td>Montant payé</td><td style="color:#059669">${parseFloat(inv.paid_amount).toFixed(2)} TND</td></tr>
      <tr class="total-due"><td><strong>Solde dû</strong></td><td><strong>${parseFloat(inv.balance_due).toFixed(2)} TND</strong></td></tr>
    </table>
    ${inv.notes ? `<div class="notes"><strong>Note :</strong> ${inv.notes}</div>` : ""}
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 600);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function TotalRow({ label, value, bold, green, red }: {
  label: string; value: string; bold?: boolean; green?: boolean; red?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${green ? "text-emerald-600" : red ? "text-red-600" : "text-gray-800"}`}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
      <div className="h-12 w-12 mx-auto mb-3 opacity-25">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}