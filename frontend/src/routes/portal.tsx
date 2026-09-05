import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  checkPortalComplaintStatus,
  checkPortalTicketStatus,
  submitPortalComplaint,
  submitPortalTicket,
  type PortalComplaintStatusResponse,
  type PortalTicketStatusResponse,
} from "@/lib/portal-api";
export const Route = createFileRoute("/portal")({
  component: PortalPage,
});

type Tab = "ticket-submit" | "ticket-status" | "complaint-submit" | "complaint-status";

const INPUT_CLS =
  "mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function PortalPage() {
  const [tab, setTab] = useState<Tab>("ticket-submit");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-foreground">Espace Patient</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Soumettez une demande ou suivez son statut — aucun compte requis.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab("ticket-submit")}
            className={`rounded-lg py-2 text-sm font-medium transition ${tab === "ticket-submit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Nouvelle demande
          </button>
          <button
            type="button"
            onClick={() => setTab("ticket-status")}
            className={`rounded-lg py-2 text-sm font-medium transition ${tab === "ticket-status" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Suivre demande
          </button>
          <button
            type="button"
            onClick={() => setTab("complaint-submit")}
            className={`rounded-lg py-2 text-sm font-medium transition ${tab === "complaint-submit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Réclamation
          </button>
          <button
            type="button"
            onClick={() => setTab("complaint-status")}
            className={`rounded-lg py-2 text-sm font-medium transition ${tab === "complaint-status" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Suivre réclamation
          </button>
        </div>

        {tab === "ticket-submit" && <SubmitForm />}
        {tab === "ticket-status" && <StatusForm />}
        {tab === "complaint-submit" && <ComplaintSubmitForm />}
        {tab === "complaint-status" && <ComplaintStatusForm />}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/signin" className="font-medium text-primary underline">
            Espace personnel
          </Link>
        </div>
      </div>
    </div>
  );
}

function SubmitForm() {
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setIsSubmitting(true);

    // Capture the form element NOW — React nulls event.currentTarget
    // as soon as the synchronous handler returns, so it will be null
    // by the time the await resolves.
    const form = event.currentTarget;
    const formData = new FormData(form);
    const medical_record_number = String(formData.get("medical_record_number") ?? "").trim();
    const last_name = String(formData.get("last_name") ?? "").trim();
    const titre = String(formData.get("titre") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const priorite = String(formData.get("priorite") ?? "Faible") as
      | "Faible"
      | "Moyenne"
      | "Élevée"
      | "Critique";

    if (!medical_record_number || !last_name || !titre || !description) {
      setError("Tous les champs sont obligatoires.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await submitPortalTicket({
        medical_record_number,
        last_name,
        titre,
        description,
        priorite,
      });
      setConfirmation(
        `Demande enregistrée sous le numéro ${response.numero}. Conservez-le pour suivre son statut.`,
      );
      form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Impossible d'enregistrer votre demande.");
      } else {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {confirmation}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de dossier médical</span>
        <input name="medical_record_number" type="text" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Nom de famille</span>
        <input name="last_name" type="text" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Objet</span>
        <input name="titre" type="text" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Description</span>
        <textarea name="description" rows={4} required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Priorité</span>
        <select name="priorite" defaultValue="Faible" className={INPUT_CLS}>
          <option value="Faible">Faible</option>
          <option value="Moyenne">Moyenne</option>
          <option value="Élevée">Élevée</option>
          <option value="Critique">Critique</option>
        </select>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className={buttonVariants({ variant: "default", className: "w-full py-3" })}
      >
        {isSubmitting ? "Envoi…" : "Envoyer la demande"}
      </button>
    </form>
  );
}

function StatusForm() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortalTicketStatusResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const numero = String(formData.get("numero") ?? "").trim();
    const medical_record_number = String(formData.get("medical_record_number") ?? "").trim();

    if (!numero || !medical_record_number) {
      setError("Tous les champs sont obligatoires.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await checkPortalTicketStatus({ numero, medical_record_number });
      setResult(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Aucune demande trouvée avec ces informations.");
      } else {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {result && (
        <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground">
          <p className="font-medium">{result.numero} — {result.titre}</p>
          <p>Statut : {result.statut}</p>
          <p>Priorité : {result.priorite}</p>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de demande</span>
        <input name="numero" type="text" placeholder="TCK-001" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de dossier médical</span>
        <input name="medical_record_number" type="text" required className={INPUT_CLS} />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className={buttonVariants({ variant: "default", className: "w-full py-3" })}
      >
        {isSubmitting ? "Recherche…" : "Vérifier le statut"}
      </button>
    </form>
  );
}

function ComplaintSubmitForm() {
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setIsSubmitting(true);

    // Capture the form element NOW — React nulls event.currentTarget
    // as soon as the synchronous handler returns, so it will be null
    // by the time the await resolves.
    const form = event.currentTarget;
    const formData = new FormData(form);
    const medical_record_number = String(formData.get("medical_record_number") ?? "").trim();
    const last_name = String(formData.get("last_name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!medical_record_number || !last_name || !description) {
      setError("Tous les champs sont obligatoires.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await submitPortalComplaint({
        medical_record_number,
        last_name,
        description,
      });
      setConfirmation(
        `Réclamation enregistrée sous le numéro ${response.numero}. Conservez ce numéro pour suivre son traitement.`,
      );
      form.reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Impossible d'enregistrer votre réclamation.");
      } else {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {confirmation}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de dossier médical</span>
        <input name="medical_record_number" type="text" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Nom de famille</span>
        <input name="last_name" type="text" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Description de la réclamation</span>
        <textarea name="description" rows={4} required className={INPUT_CLS} />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className={buttonVariants({ variant: "default", className: "w-full py-3" })}
      >
        {isSubmitting ? "Envoi…" : "Envoyer la réclamation"}
      </button>
    </form>
  );
}

/** Format an ISO date string to a readable French date. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Map raw statut values to a coloured badge class. */
function statutStyle(statut: string): string {
  switch (statut) {
    case "Nouvelle":      return "bg-blue-50 text-blue-700";
    case "En traitement": return "bg-orange-50 text-orange-700";
    case "Résolue":       return "bg-emerald-50 text-emerald-700";
    case "Fermée":        return "bg-gray-100 text-gray-500";
    default:              return "bg-gray-100 text-gray-600";
  }
}

function ComplaintStatusForm() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PortalComplaintStatusResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const numero = String(formData.get("numero") ?? "").trim();
    const medical_record_number = String(formData.get("medical_record_number") ?? "").trim();

    if (!numero || !medical_record_number) {
      setError("Tous les champs sont obligatoires.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await checkPortalComplaintStatus({ numero, medical_record_number });
      setResult(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Aucune réclamation trouvée avec ces informations.");
      } else {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 text-sm space-y-3">
          {/* Header row: numero + status badge */}
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{result.numero}</p>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statutStyle(result.statut)}`}>
              {result.statut}
            </span>
          </div>

          {/* Description */}
          <p className="text-muted-foreground leading-relaxed">{result.description}</p>

          {/* Dates */}
          <div className="border-t border-primary/20 pt-2 space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Soumise le :</span>{" "}
              {fmtDate(result.created_at)}
            </p>
            {result.resolved_at && (
              <p>
                <span className="font-medium text-foreground">Résolue le :</span>{" "}
                {fmtDate(result.resolved_at)}
              </p>
            )}
          </div>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de réclamation</span>
        <input name="numero" type="text" placeholder="REC-001" required className={INPUT_CLS} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-foreground">Numéro de dossier médical</span>
        <input name="medical_record_number" type="text" required className={INPUT_CLS} />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className={buttonVariants({ variant: "default", className: "w-full py-3" })}
      >
        {isSubmitting ? "Recherche…" : "Vérifier le statut"}
      </button>
    </form>
  );
}