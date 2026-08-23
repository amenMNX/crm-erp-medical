import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { portalSubmitRating } from "@/lib/patient-portal-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, CheckCircle } from "lucide-react";
 
export const Route = createFileRoute("/patient-portal/rating")({
  component: RatingPage,
});
 
type Step = 1 | 2 | 3;
 
const SCORE_LABELS = ["", "Très insatisfait", "Insatisfait", "Neutre", "Satisfait", "Très satisfait"];
 
function RatingPage() {
  const [step, setStep]       = useState<Step>(1);
  const [score, setScore]     = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
 
  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      await portalSubmitRating(score, comment);
      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  }
 
  const steps = [
    { num: 1, label: "Votre note" },
    { num: 2, label: "Commentaire" },
    { num: 3, label: "Confirmation" },
  ];
 
  if (submitted) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl border p-10 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Merci pour votre avis !</h2>
          <p className="text-sm text-gray-500">
            Votre note a été enregistrée de façon anonyme. Elle nous aide à améliorer
            la qualité de vos soins.
          </p>
          <div className="flex justify-center mt-4 gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-7 w-7 ${s <= score ? "text-amber-400 fill-amber-400" : "text-gray-200"}`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
 
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-400" />
          Évaluation de votre expérience
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Votre avis est 100% anonyme et nous aide à améliorer nos soins.
        </p>
      </div>
 
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 flex-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
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
              className={`text-xs hidden sm:block ${
                step === s.num ? "text-gray-800 font-medium" : "text-gray-400"
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 ${step > s.num ? "bg-emerald-500" : "bg-gray-100"}`} />
            )}
          </div>
        ))}
      </div>
 
      <div className="bg-white rounded-xl border p-6">
        {/* Step 1 — Score */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <p className="text-gray-700 font-medium">
              Comment évaluez-vous votre expérience globale ?
            </p>
            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setScore(s)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-12 w-12 transition-colors ${
                      s <= (hovered || score)
                        ? "text-amber-400 fill-amber-400"
                        : "text-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            {score > 0 && (
              <p className="text-sm text-gray-500">{SCORE_LABELS[score]}</p>
            )}
            <Button onClick={() => setStep(2)} disabled={score === 0} className="w-full">
              Suivant
            </Button>
          </div>
        )}
 
        {/* Step 2 — Comment */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-gray-700 font-medium">
              Souhaitez-vous ajouter un commentaire ?
            </p>
            <p className="text-sm text-gray-400">
              Partagez ce qui s'est bien passé ou ce qui pourrait être amélioré.
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Votre commentaire (optionnel)..."
              rows={5}
              className="resize-none"
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Retour
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Suivant
              </Button>
            </div>
          </div>
        )}
 
        {/* Step 3 — Confirm */}
        {step === 3 && (
          <div className="space-y-5">
            <p className="text-gray-700 font-medium">Confirmez votre évaluation</p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-24">Note :</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`h-5 w-5 ${
                        s <= score ? "text-amber-400 fill-amber-400" : "text-gray-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
              {comment && (
                <div className="flex gap-2">
                  <span className="text-sm text-gray-500 w-24 shrink-0">Commentaire :</span>
                  <p className="text-sm text-gray-700">{comment}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-24">Anonymat :</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  Garanti
                </span>
              </div>
            </div>
 
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
            )}
 
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Retour
              </Button>
              <Button onClick={handleSubmit} disabled={loading} className="flex-1">
                {loading ? "Envoi..." : "Soumettre"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
 