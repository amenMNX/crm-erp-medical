# difference.md — Cahier des Charges vs. Actual Codebase

Source spec: `Cahier_des_Charges_CRM_ERP_Enrichi_UML.docx`
Compared against: current state of `crm-erp-radiotherapy/` (backend + frontend)

> **2026-07-24 correction (supersedes the note below):** items #1–#3 in the old build-order table (Equipment drop, external Client/Patient portal, avances sur salaire) plus the invoice edit/detail page are **also already built** — re-verified directly against the code. Only JWT migration, PostgreSQL migration, and "changement de forme d'abonnement" remain genuinely open, plus two newly-confirmed gaps: `date_naissance` missing from `Employee`, and "gestion des incidents" not modeled as distinct from Tickets. See `steps.md` §3 and §5 for the authoritative current state — don't trust the per-section tables below without cross-checking, they're being fixed in place but may still lag in spots.

> **2026-07-21 correction:** items #2–#5 in the build-order table at the bottom of this file (CNAM frontend, dashboard KPIs, password reset, audit log/Historique) were re-checked against the zip and are **already built** — the sections above weren't rewritten line-by-line to say so, but treat every "✅ Follow cahier — build it" verdict for those four as already executed. One real bug was also found in the same pass: the audit app (`apps.audit`) was fully built but never routed in `backend/crm_erp/urls.py`, so its endpoints 404'd — that's now fixed. See `steps.md` for the corrected, current build order.

This is a working document, not a verdict — the goal is to go through each row together and decide, per item, whether to (a) build it, (b) formally drop it, or (c) note it as a deliberate, documented scope change from the original cahier des charges.

---

## 🔴 0. The big one — scope direction mismatch

The spec is explicit about this, in **§3 Périmètre du Projet → "Hors périmètre"**:

> *"Ne sont pas couverts par le présent projet : la gestion médicale des dossiers patients (dossier clinique, planification des séances de traitement), **la gestion des équipements de radiothérapie**, ainsi que l'intégration avec des systèmes hospitaliers tiers (HIS/RIS)."*

The actual codebase has gone the opposite direction:

| Built | Spec says |
|---|---|
| `Patients`, `Appointments`, `TreatmentPlan`, `TreatmentSession` models — full clinical module | Explicitly out of scope |
| `MedicalEquipment` catalog (added last session, replacing the "Products" demo page) | Explicitly out of scope ("gestion des équipements de radiothérapie") |
| Roles include `doctor`, `radiotherapist` | Spec's actor list has no clinical roles at all — see §1 below |

**This needs a decision, not a fix.** Two honest paths:
1. **The spec is outdated** — the project deliberately grew into a clinical/patient system and the cahier des charges should be revised to match reality (common in real projects; specs lag implementation). If so, we update the docx/next report to reflect that, and stop treating "not in the cahier" as a defect.
2. **The codebase drifted** — support/CRM + HR + Accounting was the actual assignment, and Patients/Appointments/TreatmentPlans/Equipment were scope creep that should either be removed or explicitly called out as a deliberate extension in the final report so it doesn't look like the brief wasn't read.

Everything below assumes we're *keeping* the clinical layer (ripping it out now would be destructive), but flags it wherever it interacts with a spec requirement.

> **✅ DECISION: Split.**
> - **Keep Patients / Appointments / TreatmentPlan / TreatmentSession.** This is a mature, deeply-integrated module (dashboard, analytics, reports all depend on it) and "radiotherapy center CRM with no patient records" is a strange product either way. Removing it now would be destructive for no real benefit. Document it in the final report as a deliberate, intentional extension beyond the cahier's boundary — not hide it, just own it.
> - **Drop the Equipment/`MedicalEquipment` module.** It was added in the previous session, touches almost nothing else (one route, one API file, one Django app), directly contradicts an explicit "hors périmètre" line, and reverting it costs almost nothing. Revert `products.tsx` back to whatever it was doing before (or leave the route unused) and remove `apps/equipment`.
> - Extra roles (`doctor`, `radiotherapist`, `manager`, `receptionist`, `assistant`) stay — they support the clinical module we're keeping.

---

## 1. Acteurs — actor/role mismatch

**Spec (§4)** defines exactly 5 actors:

| Spec actor | Spec permissions |
|---|---|
| Administrateur | Gestion des utilisateurs, des rôles, consultation des statistiques, paramétrage |
| Agent Support | Création/traitement de tickets, gestion des réclamations |
| Responsable RH | Gestion des employés, validation des congés, gestion des absences |
| Comptable | Gestion des factures, des paiements, consultation des tableaux financiers |
| Client / Patient (externe) | Soumettre une demande, consulter son statut — **no access to internal data** |

**Codebase (`UserProfile.Role`)** has 10 roles: `admin`, `doctor`, `radiotherapist`, `secretary`, `accountant`, `hr`, `support_client`, `manager`, `receptionist`, `assistant`.

- ✅ `admin` ≈ Administrateur
- ✅ `support_client` ≈ Agent Support
- ✅ `hr` ≈ Responsable RH
- ✅ `accountant` ≈ Comptable
- ❌ **No external "Client/Patient" actor at all.** There is no unauthenticated/public route for a patient to submit a ticket and check its status without an internal account. Everyone who touches the system today is an internal staff login.
- ⚠️ `doctor`, `radiotherapist`, `secretary`, `manager`, `receptionist`, `assistant` have no counterpart in the spec's actor list — byproduct of the clinical-module scope creep in §0.

**Decision needed:** build the external client portal (spec requires it), or document that "Client/Patient" was intentionally dropped for this phase?

> **✅ DECISION: Follow the cahier — build it.** A support CRM with no way for the actual client to submit a request without staff creating an account for them isn't really a CRM. Needs: an unauthenticated route to submit a ticket + a way to check its status (e.g. by ticket number + email, no login).

---

## 2. Authentification et Gestion des Utilisateurs (§5.1)

| Requirement | Status |
|---|---|
| Connexion / déconnexion | ✅ Done |
| Modification du profil | ✅ Done (built last session — `PATCH /api/accounts/me/`) |
| **Réinitialisation du mot de passe** | ❌ **Not implemented at all** — no forgot-password flow, no reset endpoint, no email trigger |
| Gestion des rôles | ✅ Done (built last session — admin can reassign a user's role) |

> **✅ DECISION: Follow the cahier — build it.** No existing version to compare against; it's a plain gap. Standard Django flow: request-reset endpoint (email + token), reset-confirm endpoint, two frontend pages.

---

## 3. Module CRM (§5.2)

| Requirement | Status |
|---|---|
| Créer / modifier / supprimer / rechercher un ticket | ✅ Done |
| Consulter les détails d'un ticket | ✅ Done |
| Attribuer un ticket à un agent | ✅ Done (multi-agent, actually goes beyond spec which implies single agent) |
| Ticket fields: numéro, date, titre, description, priorité, statut, utilisateur concerné, agent | ✅ Done |
| Priorités: Faible/Moyenne/Élevée/Critique | ✅ Matches exactly |
| Statuts: Nouveau/En cours/En attente/Résolu/Fermé | ✅ Matches exactly |
| Ajouter/modifier/consulter une réclamation | ✅ Done |
| Suivre le traitement d'une réclamation | ✅ Done (status field) |
| **Historique — "le système doit enregistrer les changements de statut, les commentaires et les interventions réalisées"** | ❌ **Not implemented.** No audit/history model exists anywhere in the codebase — not for tickets, not for complaints. Every status change is a silent overwrite with no trail. |

> **✅ DECISION: Follow the cahier — build it.** No competing implementation to weigh against; it's just missing. One shared `ActivityLog`-style model (actor, target object, change description, timestamp) reused by Tickets and Complaints covers this and also feeds the broader "journalisation des actions importantes" requirement in §6 — build them together, not twice.

---

## 4. Module Ressources Humaines (§5.3)

| Requirement | Status |
|---|---|
| Ajouter/modifier/supprimer/consulter un employé | ✅ Done |
| Employee fields: matricule, nom, prénom, date de naissance, téléphone, email, fonction, date d'embauche | ⚠️ **`date_naissance` (date of birth) is missing from the `Employee` model** — confirmed by reading `apps/hr/models.py`. Everything else (matricule, nom, prénom, téléphone, email, fonction/job_title, date d'embauche) is present. |
| Soumettre / accepter / refuser une demande de congé | ✅ Done |
| États: En attente, Acceptée, Refusée | ✅ **Confirmed exact match** — `LeaveRequest.Status` uses these exact three labels |
| Enregistrer une absence | ✅ Done |
| Consulter les absences et produire un historique | ⚠️ Partial — absence records exist, but the "History" panel is session-only client state (already flagged in `state.md`), not a real persisted audit trail |

---

## 5. Module Comptabilité (§5.4)

| Requirement | Status |
|---|---|
| Créer/modifier/consulter/supprimer une facture | ⚠️ Partial — create + delete + list exist; **no edit/detail page** (already flagged in `state.md`) |
| Invoice fields: numéro, date, client, montant, statut | ✅ Done |
| Enregistrer/consulter un paiement, l'associer à une facture | ✅ Done |
| Modes de paiement: Espèces, Chèque, Virement bancaire | ⚠️ **Check exact match** — code's `PaymentMethod` type is `"cash" \| "card" \| "bank_transfer" \| "check"`. Spec has no "card"/carte, and code's set is Espèces(cash)/Chèque(check)/Virement(bank_transfer) — **"card" is an extra option not in spec** |
| **Gestion des avances sur salaire** (salary advances) | ❌ **Not implemented at all** — no model, no endpoint, no UI. This is listed explicitly in §3 Périmètre under Module Comptabilité. |
| **Gestion des dossiers CNAM** | ⚠️ Backend model + `CNAMClaimViewSet` exist and are fully built; **zero frontend** — no route exists to actually use it |
| **Gestion du changement de forme d'abonnement** (subscription-type change) | ❌ **Not implemented at all**, and honestly unclear what this maps to in the current data model — needs clarification on what "forme d'abonnement" means in a radiotherapy-center billing context before it can be scoped |
| Tableaux de bord: nombre total de tickets, tickets ouverts, tickets résolus, nombre d'employés, nombre de congés, factures émises, paiements enregistrés | ⚠️ **Partial and split across two pages.** The `/api/dashboard/summary/` endpoint has **zero ticket/employee/leave fields** — it only returns patients/appointments/treatment/invoice/payment counts (all clinical + accounting, no CRM/HR). The ticket/employee/leave numbers the spec asks for currently only show up on the `/reports` page, computed client-side by fetching separate lists — not from a consolidated dashboard endpoint like the spec describes. |

> **✅ DECISIONS:**
> - **Payment method "card":** keep it — it's a harmless superset, not a conflict, no reason to remove a payment option customers might actually use.
> - **Avances sur salaire:** follow the cahier — build it. Nothing to compare against, plain gap. New `SalaryAdvance` model on an employee, with amount/date/status/repayment tracking, HR-permission-gated.
> - **CNAM frontend:** follow the cahier — build it. Backend is ready and waiting; this is the cheapest win on this whole list.
> - **Changement de forme d'abonnement:** ⚠️ **needs your input before it can be decided at all** — not a keep/follow call, a "what does this even mean" call. Best guess: CNAM coverage-category changes (e.g. patient moves between reimbursement schemes), but that's a guess, not a scoped feature.
> - **Dashboard KPIs:** follow the cahier — add ticket/employee/leave counts to the real `/api/dashboard/summary/` endpoint so Dashboard itself shows what the spec asks for, instead of only `/reports` computing it client-side.

---

## 6. Besoins Non Fonctionnels (§6)

| Requirement | Status |
|---|---|
| Temps de réponse < 3s | Not measured either way — no perf testing done |
| Authentification sécurisée | ✅ Passwords hashed via Django's auth system |
| Gestion des rôles et permissions | ✅ Done, server-side enforced |
| Chiffrement des mots de passe | ✅ Django default (PBKDF2) |
| **Protection des API par JWT** | ❌ **Spec explicitly requires JWT.** The codebase uses DRF's `TokenAuthentication` (opaque bearer tokens, no expiry/claims/refresh) — not JWT. This is also listed under §7.1 Choix Technologiques as a required technology and is a real backend/architecture deviation, not just a wording nitpick. |
| **Journalisation des actions importantes** (audit logging of important actions) | ❌ Not implemented — same gap as the CRM "Historique" requirement above, but broader (spec places it under security, i.e. it wants this for *all* modules, not just tickets) |

> **✅ DECISIONS:**
> - **JWT:** follow the cahier — migrate. Plain `TokenAuthentication` has no real advantage over JWT here (no expiry, no refresh, no claims) — there's nothing about the current approach worth defending. Swap to `djangorestframework-simplejwt`, update `apiFetch`/auth handling on the frontend to use access+refresh tokens.
> - **Journalisation:** covered by the same `ActivityLog` model as the CRM Historique decision above — one build, two requirements satisfied.
| Utilisation du protocole HTTPS | N/A at this stage — deployment/infra concern, not code |
| Sauvegardes régulières | N/A — infra/ops concern |
| Interface intuitive et responsive | ✅ Reasonable — Tailwind-based, looks responsive |
| Architecture modulaire | ✅ Django apps are cleanly separated |

---

## 7. Architecture Technique (§7.1)

| Spec requirement | Actual |
|---|---|
| Backend: Python, Django, DRF, **JWT Authentication** | Django + DRF ✅, but Token auth not JWT ❌ (same item as §6) |
| Frontend: **React, TypeScript, Axios, React Router** | React ✅, TypeScript ✅, but uses **TanStack Router** (not React Router) and a `fetch`-based `apiFetch` wrapper (not Axios) — functionally equivalent, but doesn't match the named stack |
| Base de données: **PostgreSQL** | Codebase uses **SQLite** (confirmed in earlier audit — `db.sqlite3`, and `docker-compose.yml` also runs SQLite in a volume, not a Postgres service). This is a real deviation from the specified stack, likely fine for a student/dev environment but worth flagging since Postgres is explicitly named in the cahier des charges |

> **✅ DECISIONS:**
> - **TanStack Router / fetch vs React Router / Axios:** **keep as-is — this is the "my work is better" case.** There's no functional gap (routing and HTTP both work correctly), and rewriting every route file and every `lib/*-api.ts` to match the named libraries exactly would be a large, purely cosmetic migration with real regression risk for zero behavior change. Document it as a substitution in the final report rather than touching code.
> - **SQLite vs PostgreSQL:** follow the cahier — migrate. Unlike the router/HTTP-client choice, this one is explicitly named twice (§6, §7.1), this is graded coursework where matching the stated stack plausibly matters for the grade, and Postgres genuinely handles concurrent writes better than SQLite for anything beyond a demo. `docker-compose.yml` already has the shape to add a `postgres` service — this is a moderate, well-defined task, not a rewrite.
| Outils: Git, GitHub, Postman, VS Code, Docker | Can't verify Git/GitHub/Postman/VS Code usage from the code alone — but **Docker is set up**: `backend/Dockerfile`, `frontend/DockerFile`, and a root `docker-compose.yml` all exist. ✅ |

---

## 8. Modèle de Données Prévisionnel (§9)

Spec's minimal data model vs. what's actually implemented — the codebase implements a **superset** of every entity listed here (more fields, more models), which is expected and fine. No gaps in this section; noted only for completeness:

| Spec entity | Covered by |
|---|---|
| Users (id, username, email, password, role) | ✅ `accounts.User` + `UserProfile` |
| Employees | ✅ `hr.Employee` |
| Tickets | ✅ `crm.Ticket` |
| Complaints | ✅ `crm.Complaint` |
| Leaves | ✅ `hr.LeaveRequest` |
| Invoices | ✅ `accounting.Invoice` |
| Payments | ✅ `accounting.Payment` |

---

## Summary — decisions made, in build order

**Updated 2026-07-24 — see `steps.md` for the authoritative, live version of this table.**

| # | Item | Decision | Status |
|---|---|---|---|
| — | CNAM frontend | Follow cahier | ✅ **Done** |
| — | Dashboard KPIs (tickets/employees/leaves) | Follow cahier | ✅ **Done** |
| — | Password reset | Follow cahier | ✅ **Done** |
| — | Ticket/Complaint Historique + general audit log | Follow cahier | ✅ **Done** |
| — | Equipment/`MedicalEquipment` module | **Drop** | ✅ **Done** — no `apps/equipment` in the backend |
| — | External Client/Patient portal | **Follow cahier** — submit + track without login | ✅ **Done** — `PublicTicketSubmitView`/`PublicTicketStatusView`, `AllowAny` |
| — | Avances sur salaire | **Follow cahier** — new model, HR-gated | ✅ **Done** — `SalaryAdvance` model + `salary-advances.tsx` |
| — | Invoice edit/detail page | **Follow cahier** | ✅ **Done** — `invoices.$invoiceId.tsx` |
| 1 | `date_naissance` missing from `Employee` | **Follow cahier** — add the field | ❌ Open — trivial |
| 2 | "Gestion des incidents" not modeled distinctly from Tickets | **Needs a decision** — merge into Tickets (e.g. a type/flag) or new model | ❌ Open |
| 3 | JWT auth | **Follow cahier** — migrate from Token to `simplejwt` | ❌ Open (Medium-Large, touches every authenticated request on the frontend) |
| 4 | PostgreSQL | **Follow cahier** — add to `docker-compose.yml`, migrate settings | ❌ Open |
| 5 | Changement de forme d'abonnement | **Needs your input first** — unclear what this maps to | Unscoped |
| — | Patients/Appointments/TreatmentPlan clinical module | **Keep as-is** — "my work is better," deeply integrated, document as intentional extension | No action needed |
| — | TanStack Router / fetch vs React Router / Axios | **Keep as-is** — "my work is better," functionally equivalent, rewrite risk not worth it | No action needed |
| — | Payment method "card" option | **Keep as-is** — harmless superset | No action needed |

Everything still open is tracked, in this same order, in `steps.md`.