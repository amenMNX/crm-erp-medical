# steps.md — how to resume this project in a new chat

**Corrected 2026-07-21.** The previous version of this file (and `state.md`/`difference.md`) had gone stale relative to the actual zip — several items listed below as "still needs building" were already built in a session that wasn't reflected in the tracking docs. This version was re-checked file-by-file against the zip. See the correction note at the top of `state.md` for details (one real bug — `apps.audit` not routed — was found and fixed in the same pass).

---

## 1. Files to upload to the new chat

Upload these, in this order, at the start of the message:

1. **`crm-erp-radiotherapy.zip`** — the actual project (backend + frontend). Get the latest copy from wherever you saved the last download.
2. **`Cahier_des_Charges_CRM_ERP_Enrichi_UML.docx`** — the spec.
3. **`state.md`** — running technical status log. It's inside the zip at the project root.
4. **`difference.md`** — the spec-vs-codebase comparison with decisions already made, also at the project root.

## 2. The one-line prompt to open with

> "Continuing the CRM-ERP radiotherapy project. Read `state.md` and `difference.md` first — decisions are already made, `difference.md` has a build-order table at the bottom. Start on item #1."

---

## 3. What's already decided (don't re-litigate these)

Full reasoning is in `difference.md` — this is just the verdict list, unchanged from before:

| Decision | What it means practically |
|---|---|
| **Drop the Equipment module** | Revert `apps/equipment`, revert `products.tsx`/`equipment-api.ts` changes — **still not done, see build order** |
| **Keep the clinical module** (Patients/Appointments/TreatmentPlan) | No action — intentional |
| **Keep TanStack Router / fetch-based API client** | No action |
| **Keep the "card" payment method** | No action |
| **Build CNAM frontend** | ✅ **Already done** — `cnam-api.ts` + `routes/cnam.tsx` exist |
| **Add ticket/employee/leave counts to `/api/dashboard/summary/`** | ✅ **Already done** — `tickets_count`, `open_tickets_count`, `resolved_tickets_count`, `employees_count`, `leave_requests_count`, `pending_leave_requests_count` are all in `apps/dashboard/views.py` |
| **Build password reset** | ✅ **Already done** — `PasswordResetRequestView`/`PasswordResetConfirmView` + `forgot-password.tsx`/`reset-password.tsx` |
| **Build a shared audit-log/Historique model** | ✅ **Built, and was silently broken until this pass** — `apps.audit` existed fully (model/mixin/views/frontend) but was never wired into root `urls.py`, so it always 404'd. Fixed 2026-07-21. |
| **Build an external Client/Patient portal** | ❌ Not started — no `AllowAny` route exists anywhere in `apps/crm` |
| **Build "avances sur salaire"** | ❌ Not started — no model/endpoint/UI found anywhere |
| **Migrate Token auth → JWT** | ❌ Not started — `settings.py` still has `rest_framework.authtoken` + `TokenAuthentication`, no `simplejwt` |
| **Migrate SQLite → PostgreSQL** | ❌ Not started — `settings.py` still has `django.db.backends.sqlite3` |

## 4. Still needs your input — bring an answer

**"Changement de forme d'abonnement"** (§3 of the cahier, under Module Comptabilité) — nobody has scoped this yet. Best guess is CNAM coverage-category changes, but that's a guess. Come with an answer to: *what does this actually mean for this radiotherapy center?*

## 5. Corrected build order (cheapest/lowest-risk first, updated 2026-07-21)

| # | Item | Status |
|---|---|---|
| ~~—~~ | ~~CNAM frontend~~ | ✅ Done |
| ~~—~~ | ~~Dashboard KPI fields~~ | ✅ Done |
| ~~—~~ | ~~Password reset~~ | ✅ Done |
| ~~—~~ | ~~Audit log / Historique~~ | ✅ Done — and the routing bug that made it 404 is now fixed |
| **1** | **Drop Equipment module** | Cleanup, ~5 min — still open |
| **2** | **External Client/Patient portal** | Unauthenticated submit + status-check for tickets |
| **3** | **Avances sur salaire** | New model on Employee, HR-permission-gated |
| **4** | **JWT migration** | `djangorestframework-simplejwt`, touches every authenticated frontend request — do after the smaller items |
| **5** | **PostgreSQL migration** | Add `postgres` service to `docker-compose.yml`, update `DATABASES` |
| **6** | **Changement de forme d'abonnement** | Only once you've clarified what it means (see §4 above) |

This is the live build order. Once an item ships, cross it out here the same way the first four were, rather than leaving it in an "upcoming" list where it goes stale.

## 6. Known environment constraints (still true as of this pass)

- The sandbox has **no network access** — can't `pip install` or `npm install` new packages. `djangorestframework-simplejwt` and any Postgres driver will need to be added to `requirements.txt` by hand, and migrations for new models will need to be **hand-written** unless the environment changes.
- `npx tsc --noEmit` is the main way to verify frontend correctness in this sandbox — `vite build`/`npm run dev` couldn't run last time (missing Linux native binding). Worth rechecking.
- Django wasn't importable in the sandbox (`venv/` is a Windows venv). If a chat needs to actually run migrations/tests, this needs sorting out first.

---

**Everything else** — full page-by-page module status, permission-class reference, prior sessions' exact file changes — lives in `state.md`. Read that file rather than asking the user to re-describe the project.
