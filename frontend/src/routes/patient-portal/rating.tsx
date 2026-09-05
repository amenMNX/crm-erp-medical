// src/routes/patient-portal/rating.tsx
// US-PAT-RATING — Évaluation de l'expérience patient
//
// Améliorations vs v1 :
//  • Historique des avis chargé via portalGetRatings() — la page montre les anciens avis
//  • Possibilité de soumettre plusieurs avis (bouton "Donner un nouvel avis")
//  • Indicateur de score moyen calculé localement depuis l'historique
//  • Feedback visuel amélioré (couleur du score, animation étoiles)
//  • État d'erreur récupérable sans rechargement
//  • Chargement de l'historique en parallèle du wizard

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  portalSubmitRating,
  portalGetRatings,
  type PortalRating,
} from "@/lib/patient-portal-api";
import { CheckCircle2, Loader2, Plus, Star } from "lucide-react";

export const Route = createFileRoute("/patient-portal/rating")({
  component: RatingPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_LABELS: Record<number, string> = {
  1: "Très insatisfait",
  2: "Insatisfait",
  3: "Neutre",
  4: "Satisfait",
  5: "Très satisfait",
};

const SCORE_COLORS: Record<number, string> = {
  1: "text-red-500",
  2: "text-orange-500",
  3: "text-amber-400",
  4: "text-lime-500",
  5: "text-emerald-500",
};

const WIZARD_STEPS = [
  { num: 1 as const, label: "Votre note" },
  { num: 2 as const, label: "Commentaire" },
  { num: 3 as const, label: "Confirmation" },
];

type Step = 1 | 2 | 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StarRow({
  score,
  hovered,
  onHover,
  onClick,
  size = "lg",
}: {
  score: number;
  hovered?: number;
  onHover?: (n: number) => void;
  onClick?: (n: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-11 w-11" : size === "md" ? "h-7 w-7" : "h-5 w-5";
  const active = hovered ?? score;
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => onHover?.(s)}
          onMouseLeave={() => onHover?.(0)}
          onClick={() => onClick?.(s)}
          disabled={!onClick}
          className={`transition-transform ${onClick ? "hover:scale-110 cursor-pointer" : "cursor-default"}`}
          aria-label={`${s} étoile${s > 1 ? "s" : ""}`}
        >
          <Star
            className={`${dim} transition-colors ${
              s <= active ? "fill-amber-400 text-amber-400" : "text-gray-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RatingPage() {
  // History
  const [history, setHistory]       = useState<PortalRating[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  // Wizard visibility
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [step, setStep]             = useState<Step>(1);
  const [score, setScore]           = useState(0);
  const [hovered, setHovered]       = useState(0);
  const [comment, setComment]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState<PortalRating | null>(null);

  // ── Load history ────────────────────────────────────────────────────────────
  useEffect(() => {
    portalGetRatings()
      .then((data) => {
        setHistory(data);
        // Show wizard immediately if no history yet
        if (data.length === 0) setShowWizard(true);
      })
      .catch(() => {
        setShowWizard(true); // fallback: show form anyway
      })
      .finally(() => setHistLoading(false));
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const rating = await portalSubmitRating(score, comment);
      setJustSubmitted(rating);
      setHistory((prev) => [rating, ...prev]);
      setShowWizard(false);
      // Reset wizard for next time
      setStep(1);
      setScore(0);
      setComment("");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erreur lors de l'envoi.");
    } finally {
      setSubmitting(false);
    }
  }

  function openNewWizard() {
    setJustSubmitted(null);
    setStep(1);
    setScore(0);
    setHovered(0);
    setComment("");
    setSubmitError("");
    setShowWizard(true);
  }

  // ── Computed ────────────────────────────────────────────────────────────────
  const avgScore =
    history.length > 0
      ? history.reduce((s, r) => s + r.score, 0) / history.length
      : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            Mon avis
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Votre avis est 100 % anonyme et améliore la qualité de vos soins.
          </p>
        </div>
        {!showWizard && history.length > 0 && (
          <button
            onClick={openNewWizard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouvel avis
          </button>
        )}
      </div>

      {/* Success flash after submission */}
      {justSubmitted && !showWizard && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Merci pour votre avis !</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Note enregistrée de façon anonyme.
            </p>
          </div>
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <WizardPanel
          step={step}
          score={score}
          hovered={hovered}
          comment={comment}
          submitting={submitting}
          submitError={submitError}
          onStepChange={setStep}
          onScoreChange={setScore}
          onHoverChange={setHovered}
          onCommentChange={setComment}
          onSubmit={handleSubmit}
          onCancel={history.length > 0 ? () => setShowWizard(false) : undefined}
        />
      )}

      {/* History */}
      {!histLoading && history.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Historique de vos avis
              <span className="ml-2 text-gray-400 font-normal">({history.length})</span>
            </h2>
            {avgScore > 0 && (
              <span className="text-sm font-semibold text-amber-500 flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {avgScore.toFixed(1)} / 5
              </span>
            )}
          </div>
          <div className="space-y-2">
            {history.map((r) => (
              <RatingCard key={r.id} rating={r} />
            ))}
          </div>
        </div>
      )}

      {histLoading && (
        <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Chargement de l'historique…</span>
        </div>
      )}
    </div>
  );
}

// ─── WizardPanel ──────────────────────────────────────────────────────────────

function WizardPanel({
  step, score, hovered, comment, submitting, submitError,
  onStepChange, onScoreChange, onHoverChange, onCommentChange,
  onSubmit, onCancel,
}: {
  step: Step;
  score: number;
  hovered: number;
  comment: string;
  submitting: boolean;
  submitError: string;
  onStepChange: (s: Step) => void;
  onScoreChange: (n: number) => void;
  onHoverChange: (n: number) => void;
  onCommentChange: (s: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {/* Step indicator */}
      <div className="px-6 pt-5 pb-0">
        <div className="flex items-center gap-1">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors ${
                  step > s.num
                    ? "bg-emerald-500 text-white"
                    : step === s.num
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </div>
              <span
                className={`ml-2 text-xs hidden sm:block ${
                  step === s.num ? "text-gray-800 font-medium" : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${step > s.num ? "bg-emerald-500" : "bg-gray-100"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="p-6">
        {/* Step 1 — Score */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <p className="text-gray-700 font-medium">
              Comment évaluez-vous votre expérience globale ?
            </p>
            <div className="flex justify-center">
              <StarRow
                score={score}
                hovered={hovered}
                onHover={onHoverChange}
                onClick={onScoreChange}
                size="lg"
              />
            </div>
            {(hovered || score) > 0 && (
              <p className={`text-sm font-medium transition-colors ${SCORE_COLORS[hovered || score]}`}>
                {SCORE_LABELS[hovered || score]}
              </p>
            )}
            <div className="flex gap-2">
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              )}
              <button
                onClick={() => onStepChange(2)}
                disabled={score === 0}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Comment */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StarRow score={score} size="sm" />
              <span className={`text-sm font-medium ${SCORE_COLORS[score]}`}>
                {SCORE_LABELS[score]}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Souhaitez-vous ajouter un commentaire ?
              </p>
              <p className="text-xs text-gray-400 mb-3">
                Partagez ce qui s'est bien passé ou ce qui pourrait être amélioré.
              </p>
              <textarea
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                placeholder="Votre commentaire (optionnel)…"
                rows={4}
                className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onStepChange(1)}
                className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Retour
              </button>
              <button
                onClick={() => onStepChange(3)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Confirm */}
        {step === 3 && (
          <div className="space-y-5">
            <p className="text-sm font-medium text-gray-700">Vérifiez avant d'envoyer</p>

            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 shrink-0">Note :</span>
                <div className="flex items-center gap-2">
                  <StarRow score={score} size="sm" />
                  <span className={`text-xs font-semibold ${SCORE_COLORS[score]}`}>
                    {SCORE_LABELS[score]}
                  </span>
                </div>
              </div>
              {comment && (
                <div className="flex gap-3">
                  <span className="text-xs text-gray-500 w-28 shrink-0">Commentaire :</span>
                  <p className="text-sm text-gray-700 leading-snug">{comment}</p>
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 shrink-0">Anonymat :</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  Garanti
                </span>
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => onStepChange(2)}
                className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Retour
              </button>
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Soumettre mon avis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RatingCard (history) ─────────────────────────────────────────────────────

function RatingCard({ rating }: { rating: PortalRating }) {
  const date = new Date(rating.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="bg-white rounded-xl border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <StarRow score={rating.score} size="sm" />
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold ${SCORE_COLORS[rating.score]}`}>
            {SCORE_LABELS[rating.score]}
          </span>
          <span className="text-xs text-gray-400">{date}</span>
        </div>
      </div>
      {rating.comment && (
        <p className="text-sm text-gray-600 leading-relaxed border-t pt-2">{rating.comment}</p>
      )}
    </div>
  );
}