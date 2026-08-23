import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portalDocuments, type PatientDocument } from "@/lib/patient-portal-api";
import { FileText, Download, Filter } from "lucide-react";

export const Route = createFileRoute("/patient-portal/documents")({
  component: DocumentsPage,
});

const DOC_TYPES = [
  { value: "",             label: "Tous" },
  { value: "compte_rendu", label: "Comptes-rendus" },
  { value: "ordonnance",   label: "Ordonnances" },
  { value: "imagerie",     label: "Imagerie" },
  { value: "protocole",    label: "Protocoles" },
  { value: "facture",      label: "Factures" },
  { value: "autre",        label: "Autres" },
];

const TYPE_ICONS: Record<string, string> = {
  compte_rendu: "📄",
  ordonnance:   "💊",
  imagerie:     "🔬",
  protocole:    "⚡",
  facture:      "🧾",
  autre:        "📎",
};

function DocumentsPage() {
  const [docs, setDocs]           = useState<PatientDocument[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    portalDocuments(typeFilter || undefined)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [typeFilter]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Mes documents
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Consultation en lecture seule · Téléchargement PDF
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl animate-pulse" />
          ))
        ) : docs.length === 0 ? (
          <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun document disponible.</p>
          </div>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border p-4 flex items-center gap-4"
            >
              <span className="text-2xl shrink-0">
                {TYPE_ICONS[doc.document_type] ?? "📎"}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                  <span>
                    {DOC_TYPES.find((t) => t.value === doc.document_type)?.label ??
                      doc.document_type}
                  </span>
                  {doc.file_size_kb > 0 && <span>{doc.file_size_kb} KB</span>}
                  <span>{new Date(doc.created_at).toLocaleDateString("fr-FR")}</span>
                  {doc.uploaded_by_name && <span>Par {doc.uploaded_by_name}</span>}
                </div>
              </div>

              <a
                href={doc.file_path}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary
                           hover:text-primary/80 bg-primary/5 hover:bg-primary/10
                           px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}