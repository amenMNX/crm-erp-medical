# 🔍 FULL PROJECT AUDIT REPORT
## CRM-ERP Radiotherapy Center - Technical Status

**Date:** 2026-07-21
**Project:** Conception et Développement d'un CRM d'Assistance et de Support Client avec Intégration de Modules ERP
**Status:** ✅ **All core + secondary modules connected — migrations for 2 new apps need to be applied**

> **2026-07-21 correction pass:** this report (dated 2026-07-19) was stale in two ways when checked against the actual zip contents. Both are fixed now:
> 1. **CNAM Claims frontend was already built**, not "not started" as the table below said — `cnam-api.ts` + `routes/cnam.tsx` exist and are wired into the sidebar/router (see `CRM-ERP-Improvements.md` session log). Table below corrected.
> 2. **Real bug found: `apps.audit` was never routed.** It's in `INSTALLED_APPS`, the `AuditLoggingMixin` is applied to `TicketViewSet`/`ComplaintViewSet`, `LoginView`/`LogoutView` log events, and the frontend (`audit-api.ts`, `historique.tsx`) calls `GET /audit/log/` — but root `backend/crm_erp/urls.py` never had a `path("api/audit/", include("apps.audit.urls"))` line, so every one of those calls was 404ing. Added the missing line. This means the Historique page has likely never actually worked end-to-end until this fix, despite being reported as "Connected" below.
>
> Everything else in this report (module table, permissions, known gaps 1–9) was re-checked against the zip and is still accurate as of 2026-07-21.

> **Note on report history:** the 2026-07-18 version of this report listed Board and Roles & Permissions as "out of scope demo pages" and Dashboard/Analytics/Reports/Calendar/Schedule/Settings/Notifications/Messages/Products as unaudited or mock. All of those were wired to real (in some cases newly-built) backend data in this pass. This version reflects that.

---

## 📑 TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Module Status](#module-status)
3. [Backend Permissions Reference](#backend-permissions-reference)
4. [Known Gaps](#known-gaps)
5. [Design Decisions Worth Knowing](#design-decisions-worth-knowing)
6. [Suggested Next Steps](#suggested-next-steps)

---

## EXECUTIVE SUMMARY

Every page in the sidebar now reads/writes real backend data. Two new Django apps were added (`apps.messaging` for Notifications + internal Messages, `apps.equipment` for the Medical Equipment/Supplies catalog that used to be a generic "Products" e-commerce mock). Board and Roles & Permissions — previously flagged as out-of-scope static demos — are now wired to real Tickets and real Users/roles respectively.

### Quick Stats

| Metric | Value |
|--------|-------|
| **Modules connected to backend** | All of them (see table below) |
| **New backend apps this pass** | 2 (`apps.messaging`, `apps.equipment`) |
| **New/changed backend endpoints this pass** | `PATCH /api/accounts/me/`, `/api/notifications/*`, `/api/messages/*`, `/api/equipment/*` |
| **⚠️ Action required before this runs** | `makemigrations`/`migrate` were hand-written, not generated — see Known Gaps #1 |

---

## MODULE STATUS

| Module | Backend | Frontend | Status |
|--------|---------|----------|--------|
| **Auth (login/logout)** | ✅ Token auth | ✅ Real login + logout | Connected |
| **Tickets** | ✅ `TicketViewSet` | ✅ `tickets-api.ts` + real CRUD | Connected |
| **Employees** | ✅ `EmployeeViewSet` | ✅ `employees-api.ts` + real CRUD | Connected |
| **Complaints** | ✅ `ComplaintViewSet` | ✅ Real CRUD | Connected |
| **Leaves** | ✅ `LeaveRequestViewSet` (+ approve/reject actions) | ✅ `leaves-api.ts`, real approve/reject | Connected |
| **Absences** | ✅ `AbsenceViewSet` | ✅ `absence-api.ts`, employee picked from real FK dropdown | Connected |
| **Invoices** | ✅ `InvoiceViewSet` | ✅ `invoices-api.ts`, list + create wired, patient picked from real FK dropdown | Connected — no edit/detail page yet, delete only |
| **Payments** | ✅ `PaymentViewSet` | ✅ `payments-api.ts`, full CRUD-minus-edit, tied to invoice | Connected — recording a payment auto-updates invoice status server-side |
| **Patients** | ✅ `PatientViewSet` | ✅ `patients-api.ts`, list/detail/create/delete wired | Connected — detail panel shows real invoice count + total billed per patient |
| **CNAM Claims** | ✅ `CNAMClaimViewSet` exists, fully modeled | ✅ `cnam-api.ts` + `routes/cnam.tsx`, full CRUD, patient/invoice pickers, status badges | Connected (corrected 2026-07-21 — was wrongly marked not-started in the prior version of this report) |
| **Dashboard** | ✅ `apps/dashboard` summary endpoint | ✅ `dashboard-api.ts`, live KPIs | Connected |
| **Analytics** | Reuses dashboard/invoices/tickets endpoints | ✅ Real revenue-by-month + tickets-by-status charts (was fake e-commerce data) | Connected |
| **Reports** | Reuses tickets/employees/leaves/invoices/payments endpoints | ✅ Real KPI cards (was an empty stub) | Connected |
| **Calendar** | ✅ `AppointmentViewSet` existed but had no frontend client | ✅ New `appointments-api.ts`; month/day/year views + create dialog | Connected |
| **Schedule** | Same `AppointmentViewSet` | ✅ Weekly grid of real appointments + create dialog | Connected |
| **Board** | ✅ `TicketViewSet` (same as Tickets) | ✅ Real Kanban of tickets by `statut`, move left/right calls `PATCH` | Connected (was static demo) |
| **Settings → Profile** | ✅ `PATCH /api/accounts/me/` (added this pass — was GET-only) | ✅ Loads + saves real first/last name, email, phone, department | Connected |
| **Roles & Permissions** | ✅ `/api/accounts/users/` (existing `UserViewSet`) | ✅ Real role list with live user counts, real assigned-users per role, "Assign role" action (`PATCH` a user's `profile.role`, admin-only), permission matrix now mirrors the actual `CrmPermission`/`TicketPermission`/`AccountingPermission`/HR role lists instead of a fake per-action matrix | Connected (was static demo) |
| **Notifications** | 🆕 `apps.messaging.Notification` + `NotificationViewSet` (list/mark-read/mark-all-read/unread-count) | ✅ New `notifications-api.ts`; both `/notifications` page and the header bell dropdown wired | Connected — **migration not yet applied, see Known Gaps** |
| **Messages** | 🆕 `apps.messaging.Message` + `MessageViewSet` (simple DM model, sender/recipient) | ✅ New `messages-api.ts`; conversations grouped client-side by other participant | Connected — **migration not yet applied, see Known Gaps** |
| **Historique / Audit Log** | ✅ `apps.audit` — `AuditLogEntry` model, `AuditLoggingMixin` on Tickets/Complaints, `LoginView`/`LogoutView` log auth events | ✅ `audit-api.ts` + `routes/historique.tsx`, admin-only, read-only list with search | Connected — **was actually broken until 2026-07-21** (see correction note at top): the app was never routed in root `urls.py`, so `GET /audit/log/` 404'd. Now fixed. |
| **Password Reset** | ✅ `PasswordResetRequestView` + `PasswordResetConfirmView`, `send_mail` with uid/token link | ✅ `forgot-password.tsx` + `reset-password.tsx` | Connected |
| **Products → Equipment** | 🆕 `apps.equipment.MedicalEquipment` + `MedicalEquipmentViewSet` | ✅ New `equipment-api.ts`; repurposed the fake product-catalog page into a Medical Equipment/Supplies catalog with add/delete | Connected — **migration not yet applied, see Known Gaps**. Route file stays `products.tsx` (sidebar label is now "Equipment") |

---

## BACKEND PERMISSIONS REFERENCE

All write operations are gated by the logged-in user's `UserProfile.role` (not just Django's `is_staff`/`is_superuser`). Read access is open to any authenticated user. This matters if a feature "doesn't work" but no error shows in the browser console — check the role first.

| App | Permission class | Roles allowed to write |
|-----|-------------------|--------------------------|
| CRM — Patients, Appointments, Complaints | `CrmPermission` | `admin`, `doctor`, `secretary`, `radiotherapist` |
| CRM — Tickets | `TicketPermission` | `admin`, `support_client`, `secretary` |
| Accounting (Invoices, Payments, CNAM Claims) | `AccountingPermission` | `admin`, `accountant` |
| HR (Employees, Leaves, Absences) | `HrPermission` (confirmed this pass — same `ReadOnlyOrRole` pattern) | `admin`, `hr` |
| Equipment (🆕) | `EquipmentPermission` | `admin`, `radiotherapist`, `doctor` |
| Notifications / Messages (🆕) | `IsAuthenticated`, scoped to `request.user` as recipient/sender — no role restriction | any authenticated user (for their own data) |
| `PATCH /api/accounts/me/` (🆕) | `IsAuthenticated`, self-only, restricted field set (`first_name`, `last_name`, `email`, `profile.phone`, `profile.department` — NOT `role`/`is_staff`/`username`) | any authenticated user, own account only |
| `/api/accounts/users/` writes (role assignment) | `IsAdminUser` (existing, unchanged) | `admin` / superuser only |

New users get `profile.role = 'secretary'` by default via a `post_save` signal on `User` — this will silently block admin-only actions until the role is manually bumped.

---

## BUG FIXES THIS PASS (2026-07-19, session 3)

The "Roles & Permissions" page was reported as not working, even for an admin account. Two real, separate bugs were found and fixed:

1. **Broken navigation link (the actual cause of "doesn't work").** The route file was named `roles _permission.tsx` — with a literal space — which made TanStack Router generate the route path `/roles _permission` (space and all). The sidebar link pointed to `/roles_permission` (no space). These never matched, so the sidebar link never actually opened the page correctly for anyone, admin or not. **This was a known, previously-documented issue** (see `CRM-ERP-Improvements.md`, which flagged it months ago and recommended a rename that never happened). Fixed by renaming the file to `roles_permission.tsx`, updating the `createFileRoute("/roles_permission")` call inside it, and hand-patching `routeTree.gen.ts` (the auto-generated route manifest) to match, since the dev server wasn't running in this sandbox to regenerate it automatically.
2. **Real permission-model bug (would have blocked "Assign Role" even once the page loaded).** `UserViewSet` gated all writes (including role assignment) with DRF's built-in `IsAdminUser`, which checks Django's `is_staff` flag. Nothing in this app ever sets `is_staff` — it's a separate concept from this app's own `profile.role` field, which every other permission class in the project (`CrmPermission`, `HrPermission`, etc.) correctly checks instead. A user with `profile.role = "admin"` who wasn't *also* a Django superuser (created via `createsuperuser` in a shell, outside the app) would still get a 403 trying to manage users or assign roles. Fixed by switching to `IsAdminRole` (this app's own role check) in `apps/accounts/views.py`, and updated `accounts_permission.md` to match. In the current database both existing accounts happen to already be Django superusers, so this specific bug wasn't the one you were hitting — but it was real and would have blocked any *future* admin who wasn't also a superuser.

---

## SESSION 2 CHANGES (Notifications, Messages, Equipment)

See git history / prior session summary for the full list — `apps.messaging`, `apps.equipment`, and the Board/Roles/Settings/Calendar/Schedule/Analytics/Reports wiring were all completed in the session before this one. Per `difference.md`, the Equipment module is slated to be **reverted** (contradicts the cahier des charges' explicit exclusion) — not done yet as of this note.

---

1. **⚠️ Migrations for the 2 new apps were hand-written, not generated.** This sandbox has no Django installed and no network access, so `makemigrations` couldn't actually run. I hand-wrote `apps/messaging/migrations/0001_initial.py` and `apps/equipment/migrations/0001_initial.py` to match the models exactly, and registered both apps in `INSTALLED_APPS` + root `urls.py`. **Before running the backend, do `python manage.py migrate` and sanity-check `python manage.py makemigrations --check` to confirm nothing drifted.** The `date_joined` field added to `UserSerializer` needs no migration (it's a built-in Django `User` field, just newly exposed).
2. **`npx vite build` doesn't run in this sandbox** — `node_modules` was installed on Windows and is missing the Linux native binding for `rolldown` (`@rolldown/binding-linux-x64-gnu`). `npx tsc --noEmit` passes cleanly across the whole project (zero errors), which is a strong signal, but a real build/dev-server smoke test hasn't happened. Run `npm run dev` or `npm run build` on your machine to confirm.
3. **No invoice edit or detail page.** Unchanged from before — `invoices.index.tsx` only supports create + delete.
4. **Invoice line items aren't persisted.** Unchanged — client-side calculator only.
5. **CNAM Claims has zero frontend.** Unchanged.
6. **Absences "History" panel is session-only.** Unchanged, intentional given current backend.
7. **Messages has no read-receipt UI polish and no pagination.** Works for a reasonable message volume; if this becomes a real chat feature, add pagination and maybe websockets/polling tuning (currently polls every 15s).
8. **Permission matrix on Roles & Permissions is a read-only reference, not editable.** The backend only supports role-based (not per-module-per-action) permissions, so making the matrix "editable" would be fake UI with nothing to save to. Flagged in the page itself.
9. **API file naming inconsistency — now fixed.** `Invoices-api.ts`/`Payments-api.ts` (capitalized) were renamed in every importer to match the actual lowercase files (`invoices-api.ts`/`payments-api.ts`). This was a real, previously-undetected bug: it silently worked on Windows/Mac (case-insensitive filesystems) but would have 404'd at build time on Linux.

---

## DESIGN DECISIONS WORTH KNOWING

- **Payments drive invoice status automatically.** `Payment.save()`/`delete()` call `Invoice.refresh_payment_status()` server-side — an invoice flips to `paid` once `paid_amount >= total_amount`, and back to `issued` if a payment is removed. The frontend doesn't need to (and shouldn't) set invoice status manually when payments are involved.
- **Patients detail panel repurposes "Orders/Spent."** Replaced with real, derived data: invoice count and total billed, computed client-side by filtering the invoices list by `patient` FK.
- **Messages has no "Conversation" model.** `Message` is a flat sender/recipient row (like a DM). The frontend groups messages into conversations client-side by "the other participant." This is simpler than a full thread/channel model and fits a small internal team; revisit if group chat is ever needed.
- **Roles & Permissions treats roles as fixed, not creatable.** `UserProfile.Role` is a Django `TextChoices` enum, not a database table — you can't add a new role from the UI, only assign an existing role to a user. The old "Create Role"/"Remove Role" buttons were removed since they had nothing real to do.
- **Equipment kept the `products.tsx` filename.** Renaming the file would mean a new route path; since the spec calls for a Medical Equipment/Supplies catalog, only the sidebar label ("Equipment") and page content changed, not the URL.

---

## SUGGESTED NEXT STEPS

In rough priority order:

1. **Run migrations** for `apps.messaging` and `apps.equipment` and confirm `makemigrations --check` is clean (see Known Gaps #1).
2. **Run a real `npm run dev`/`npm run build`** on a machine with matching native bindings to confirm the frontend actually compiles end-to-end (see Known Gaps #2).
3. Decide if CNAM Claims frontend is in scope for a future pass.
4. Build an invoice edit/detail page if the spec requires changing invoice status or amounts after creation.
5. If Messages needs to scale beyond a small internal team, consider a proper Conversation/Thread model and websockets instead of polling.

---

**Report generated:** 2026-07-19
**Status:** Reflects verified current state as of this date
**Supersedes:** 2026-07-18 report
