# CRM-ERP Radiotherapy — Full Improvement Report

**Analyzed:** July 18, 2026  
**Stack:** Django 6 + DRF · TanStack Router (React/TSX) · SQLite → PostgreSQL · Bun · Docker Compose  
**Current state:** ~55–60% complete. Core data layer and many API routes exist. Most UI pages fetch from the real API. Several screens are still fully local-state or pure mockups.

---

## 1. Critical Blockers (Fix First)

### 1.1 Routes still running on local state only

These pages never call the backend. Data is lost on refresh.

| Route | Problem |
|---|---|
| `board.tsx` | Kanban tasks live in `useState(columns)` — no API, generic "to-do" content |
| `calendar.tsx` | Events seeded with hardcoded 2024 dates, no connection to `Appointment` API |
| `schedule.tsx` | Fully static weekday grid, no real data |
| `analytics.tsx` | KPIs and charts use hardcoded arrays (revenue, signups, channels) |
| `reports.tsx` | Placeholder text only — no queries at all |
| `products.tsx` | Hardcoded product catalog unrelated to the radiotherapy domain |
| `notifications.tsx` | Static list imported from `notifications.ts` — no real events |
| `messages.tsx` | Hardcoded conversation thread, no messaging model on the backend |
| `roles _permission.tsx` | Full permissions matrix is local state; uses generic Radiology roles instead of the actual `UserRole` type from `domain.ts` |
| `settings.tsx` | Profile form saves to `useState` only, never calls `PATCH /accounts/me/` |

**Fix pattern for each:** replace `useState(seed)` + local mutations with `useQuery` + `useMutation` pointing to the existing DRF endpoints. The `apiFetch` helper and React Query are already wired in.

### 1.2 Filename casing inconsistency (breaks on Linux/CI)

`dashboard.tsx` and `invoices.$invoiceId.tsx` import from `"@/lib/Invoices-api"` and `"@/lib/Payments-api"` (capital I/P). The actual files on disk are `invoices-api.ts` and `payments-api.ts` (lowercase). This works on macOS (case-insensitive FS) but **will silently fail in Docker/Linux** — exactly the environment used in `docker-compose.yml`.

**Fix:** rename all imports to match the actual lowercase filenames:
```ts
// wrong
import { fetchInvoices } from "@/lib/Invoices-api";
// correct
import { fetchInvoices } from "@/lib/invoices-api";
```

### 1.3 `signup.tsx` tries 4 endpoints in a loop

The registration page iterates through `/auth/register/`, `/accounts/register/`, `/api/auth/register/`, `/users/register/` looking for a working one. None of these match the actual route (`POST /api/accounts/register/`). Users cannot self-register.

**Fix:** point directly to the single correct endpoint and expose it in `accounts/urls.py`.

### 1.4 `CORS_ALLOW_ALL_ORIGINS = True` in production path

`settings.py` defaults `CORS_ALLOW_ALL_ORIGINS` to `True` when `DJANGO_CORS_ALLOW_ALL_ORIGINS` is not set. The docker-compose `environment:` block does not set it, so every containerized deployment runs with all-origins open.

**Fix:** default to `False` and explicitly list allowed origins via `CORS_ALLOWED_ORIGINS`.

```python
CORS_ALLOW_ALL_ORIGINS = os.getenv("DJANGO_CORS_ALLOW_ALL_ORIGINS", "False").lower() == "true"
```

### 1.5 SQLite in Docker with a named volume

`docker-compose.yml` mounts `sqlite_data:/app/db` but the Django `DATABASES` path points to `BASE_DIR / 'db.sqlite3'` (the project root, not `/app/db`). The volume is never actually used. More importantly, SQLite is not suitable for multi-process/multi-container deployments.

**Fix:** switch to PostgreSQL. The `requirements.txt` already includes `psycopg[binary]`.

---

## 2. Security Issues

### 2.1 `DEFAULT_PERMISSION_CLASSES` is `IsAuthenticatedOrReadOnly`

Any unauthenticated user can read **all** patient data, invoices, treatment plans, HR records, and CNAM claims. In a healthcare context this is a serious confidentiality breach.

**Fix:** change the global default to `IsAuthenticated`:
```python
"DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
```

### 2.2 `ReadOnlyOrRole` allows any authenticated user to read anything

The current permission class grants GET/HEAD/OPTIONS to *all* authenticated users regardless of role. A secretary can read HR salary data; a support agent can read accounting records.

**Fix:** replace with an object-level or resource-level permission that maps roles to allowed resources. Example pattern:

```python
class RoleBasedPermission(BasePermission):
    read_roles: list[str] = []
    write_roles: list[str] = []

    def has_permission(self, request, view):
        role = get_user_role(request.user)
        if request.method in SAFE_METHODS:
            return role in self.read_roles
        return role in self.write_roles
```

### 2.3 Token authentication with no expiry

DRF `TokenAuthentication` issues tokens that never expire. If a token is leaked it is valid indefinitely.

**Fix:** add `djangorestframework-simplejwt` (already in `requirements.txt`) and switch to short-lived access tokens + refresh tokens:
```python
"DEFAULT_AUTHENTICATION_CLASSES": [
    "rest_framework_simplejwt.authentication.JWTAuthentication",
],
```

### 2.4 `DEBUG = True` defaults

`settings.py` defaults `DEBUG` to `True`. Any misconfigured deployment will expose tracebacks publicly.

**Fix:** default to `False`:
```python
DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() == "true"
```

### 2.5 Auth token stored in `localStorage`

`auth.ts` stores the token in `localStorage`, which is accessible to any JavaScript on the page (XSS attack surface). In a medical application this is high risk.

**Fix:** store the token in an `HttpOnly` cookie via a server-side session, or at minimum use a short-lived JWT and clear it on tab close with `sessionStorage`.

### 2.6 No rate limiting on login endpoint

`POST /api/accounts/login/` has no throttling. Brute-force attacks against credentials are trivial.

**Fix:** add DRF throttling to the login view:
```python
class LoginView(ObtainAuthToken):
    throttle_classes = [AnonRateThrottle]
    throttle_scope = "login"
```

---

## 3. Missing Backend Features

### 3.1 No `register` endpoint

The `accounts/urls.py` exposes `/login/`, `/logout/`, `/me/`, `/change-password/`, and a `UserViewSet` — but no open registration endpoint. `signup.tsx` is broken as a result.

**Fix:** add a `RegisterView` that creates a `User` + `UserProfile` and returns the token.

### 3.2 No patient detail page / appointment sub-routes

`patients.index.tsx` shows a list. Clicking a patient reveals a sidebar preview, but there is no dedicated `/patients/:id` route, no appointment list for a patient, and no treatment plan viewer. The backend models for all of this already exist.

**Fix:** add:
- `GET /api/crm/patients/:id/appointments/` (nested resource or filter on `/appointments/?patient=:id`)
- `GET /api/crm/patients/:id/treatment_plans/`
- Frontend routes `patients.$patientId.tsx`, `patients.$patientId.appointments.tsx`

### 3.3 No invoice line items model

`invoices.new.tsx` supports line-item entry (name, qty, price) and computes subtotal/tax on the fly, but the backend `Invoice` model only stores the totals (`subtotal`, `tax_amount`, `total_amount`) — there is no `InvoiceLineItem` model. Line item data is discarded after creation.

**Fix:** add an `InvoiceLineItem` model:
```python
class InvoiceLineItem(models.Model):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
```

### 3.4 No notification model

`notifications.ts` exports a hardcoded list. There is no `Notification` model, no endpoint, no mechanism to trigger notifications when a ticket changes status, a leave request is approved, or a payment is recorded.

**Fix:** add a `Notification` model in a new `apps/notifications/` app and use Django signals to create notifications on key events (ticket status change, invoice paid, leave approved).

### 3.5 No real messaging backend

`messages.tsx` shows a static chat UI. There is no `Message` model, no Django Channels / WebSocket support, and no REST fallback for polling.

**Fix options:** 
- Short term: a simple `Message` model with `GET /api/messages/?conversation=:id` for polling.
- Long term: add Django Channels + WebSocket support for real-time messaging.

### 3.6 `board.tsx` has no backing model

The Kanban board is entirely fictional ("Auth API contract", "Invoice PDF export"). There is no `Task` or `Board` model.

**Fix:** either connect the board to the existing `Ticket` model (map ticket statuses to columns) or add a dedicated `Task` model for internal workflow tracking.

### 3.7 Dashboard `DashboardSummaryView` lacks per-month data

The view returns aggregate counts only. `dashboard.tsx` tries to build a monthly revenue chart from individual invoices fetched separately — a second full-list query just for charting.

**Fix:** add a `monthly_revenue` array to the summary endpoint using Django ORM `TruncMonth`:
```python
from django.db.models.functions import TruncMonth
monthly = (
    Invoice.objects.annotate(month=TruncMonth("issue_date"))
    .values("month")
    .annotate(total=Sum("total_amount"))
    .order_by("month")
)
data["monthly_revenue"] = [{"month": r["month"].strftime("%Y-%m"), "total": str(r["total"])} for r in monthly]
```

### 3.8 No `Schedule` / `Appointment` calendar integration

`schedule.tsx` shows a static weekly grid. `calendar.tsx` stores events in `useState`. The backend already has `Appointment` with `appointment_date`. These screens should read from and write to `/api/crm/appointments/`.

---

## 4. Type/API Mismatches (Frontend ↔ Backend)

### 4.1 `domain.ts` `Ticket.agent` is `string`, backend is `agents: number[]`

`domain.ts` defines `agent: string` (singular). The real API returns `agents: number[]` + `agent_details: {id, name}[]`. `tickets.tsx` uses `ApiTicket` from `tickets-api.ts` (correct), but `domain.ts` is still stale and used in `roles_permission.tsx`, creating confusion.

**Fix:** update `domain.ts` to match the actual API shape, or remove the stale local type entirely and always import from the `*-api.ts` files.

### 4.2 `domain.ts` `Invoice.statut` uses French labels, API uses English

`domain.ts` defines `InvoiceStatus = "Brouillon" | "Émise" | "Payée" | "Annulée"`. The real API (and `invoices-api.ts`) uses `"draft" | "issued" | "paid" | "cancelled"`. The `domain.ts` type is never used in the actual invoice routes but creates a trap for future contributors.

**Fix:** update or delete the stale `domain.ts` Invoice types.

### 4.3 `Ticket.statut` length field too short on the backend

`Ticket.statut` is `max_length=20` but the choice `"En attente"` is 10 chars and `"En cours"` is 8. That's fine, but `"En traitement"` in `Complaint` is 13 chars, and its field is also `max_length=20` — only 7 chars of margin. Worth adding a migration to `max_length=30` for future-proofing.

### 4.4 Pagination not handled consistently

`fetchTickets()`, `fetchPatients()`, etc. use a local `unwrap()` helper that handles both `T[]` and `{results: T[], count: number}` formats. But the backend has `PAGE_SIZE = 10`, so any list with more than 10 items will silently return only the first page. There is no pagination UI anywhere.

**Fix:** either raise `PAGE_SIZE` to a safe ceiling (`200`) per resource, or add cursor/page controls to each list page and pass `?page=N` in the fetch calls.

---

## 5. Code Quality & Architecture

### 5.1 Duplicate `Paginated<T>` / `unwrap()` in every `*-api.ts` file

Every lib file defines the same two utilities. That's 8+ copies of identical code.

**Fix:** move to `api.ts`:
```ts
export type Paginated<T> = { results: T[]; count: number } | T[];
export function unwrap<T>(data: Paginated<T>): T[] {
  return Array.isArray(data) ? data : data.results;
}
```

### 5.2 `backend/.git_backup/` committed to the repo

The directory `backend/.git_backup/` contains a full git repo skeleton. This should never be committed and bloats the archive. Add to `.gitignore` and remove from the tree.

### 5.3 `backend/venv/` committed to the repo

`backend/venv/` (the Python virtual environment with all packages) is tracked. This adds hundreds of MB to the archive unnecessarily.

**Fix:** add `venv/` to `.gitignore` and remove it from git history (`git rm -r --cached backend/venv`).

### 5.4 `backend/db.sqlite3` committed

The SQLite database file (with real or demo data) is tracked in git. This is both a security risk (data leak) and a merge-conflict source.

**Fix:** add `*.sqlite3` to `.gitignore`.

### 5.5 Route file has a space in its name

`roles _permission.tsx` (with a space) generates the route `/roles _permission`. This is unusual and will cause URL-encoding issues in some browsers/servers. The `createFileRoute` call already has to use the exact string with a space.

**Fix:** rename to `roles-permissions.tsx` and update the route to `/roles-permissions`.

### 5.6 `frontend/.tanstack/tmp/` build artifacts committed

Two TanStack Router temp files are tracked. These are ephemeral build artifacts.

**Fix:** add `.tanstack/` to `.gitignore`.

### 5.7 `frontend/dist/` build output committed

The compiled `dist/client/` and `dist/server/` bundles are tracked. This is a large binary diff on every build.

**Fix:** add `dist/` to the frontend `.gitignore` and serve the built assets from a CI artifact or Docker layer instead.

### 5.8 No input validation on backend serializers

`PatientSerializer`, `TicketSerializer`, etc. inherit from `ModelSerializer` with no extra validation. Examples of what's missing:
- `cin` accepts any string up to 20 chars — no format check for the Tunisian CIN format.
- `phone` accepts any string — no phone number normalization.
- `invoice_number` uniqueness is enforced by the DB but the 500 error isn't caught into a friendly 400.

**Fix:** add `validate_*` methods and `UniqueValidator` where appropriate.

### 5.9 N+1 query risk in `DashboardSummaryView`

The view fires 10 separate `COUNT` queries in sequence. For a busy database these should be batched or cached.

**Fix:** combine using a single query with `Case/When` or cache the result for 60 seconds with `django.core.cache`.

### 5.10 `TreatmentSession.machine` and `.room` are free-text `CharField`

There is no `Machine` or `Room` model. Typos will produce inconsistent data (e.g. "Linac 1" vs "LINAC1"). This also prevents any scheduling conflict detection.

**Fix:** add `Machine` and `Room` models, replace the free-text fields with ForeignKeys, and expose `/api/crm/machines/` and `/api/crm/rooms/` for the frontend selects.

---

## 6. Missing Domain Features (vs. Radiotherapy Spec)

These are features implied by the domain that have no backend or frontend implementation yet:

| Feature | Why It Matters |
|---|---|
| **Dose tracking / cumulative dose validation** | `TreatmentSession.dose_delivered` exists but there's no validation that the sum doesn't exceed `TreatmentPlan.total_dose` |
| **Machine scheduling / conflict detection** | No check that two sessions are not booked on the same machine at the same time |
| **CNAM claim workflow UI** | `CNAMClaim` model and serializer exist on the backend but there is zero frontend UI for it |
| **PDF invoice export** | `invoices.$invoiceId.tsx` has no export button; `Pillow` is in requirements but unused |
| **Patient photo / document upload** | No `FileField` on `Patient`, no upload endpoint |
| **Audit log / medical record history** | No change-tracking on treatment sessions or patient records (required for medical compliance) |
| **Role-gated UI** | The frontend has no `useCurrentUser()` hook that reads the logged-in role and hides/shows sections accordingly |
| **Multi-language support** | The project mixes French and English (field names, status values, UI labels) with no i18n layer |

---

## 7. Testing

### 7.1 Backend test files exist but are incomplete

Each app has a `tests.py` file with test classes. `accounting/tests.py` is the most complete (~10 KB). Most others test only happy paths.

**What's missing:**
- Tests for permission enforcement (a secretary cannot create an invoice)
- Tests for the `refresh_payment_status` side-effect on `Payment.save()`
- Tests for the `Ticket._generate_numero()` race-condition guard
- Tests for the `Complaint.save()` auto-setting `resolved_at`

### 7.2 No frontend tests at all

No `*.test.tsx` or `*.spec.ts` files exist anywhere in `src/`. The audit report confirms `< 5%` coverage.

**Recommended starting points:**
- Unit test `apiFetch` error parsing
- Integration test the sign-in flow with MSW (Mock Service Worker)
- Snapshot test the `AppShell` and `Badge` components

### 7.3 No CI pipeline

There is no `.github/workflows/` directory or any CI config. Tests are never run automatically.

**Fix:** add a GitHub Actions workflow:
```yaml
# .github/workflows/ci.yml
jobs:
  backend:
    steps:
      - run: pip install -r requirements.txt
      - run: python manage.py test
  frontend:
    steps:
      - run: bun install && bun run typecheck && bun run test
```

---

## 8. DevOps & Deployment

### 8.1 `docker-compose.yml` uses `npm run dev` for the frontend

The frontend Dockerfile and compose config run the Vite dev server in production. This is slow, exposes source maps, and doesn't serve the SSR-ready output.

**Fix:** build with `bun run build` and serve the `dist/` output with a lightweight server (or Nginx).

### 8.2 No `healthcheck` in compose

If the Django container crashes on startup the frontend will start sending requests into a black hole with no feedback.

**Fix:** the `health.py` endpoint already exists at `/api/dashboard/health/`. Add it to compose:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/api/dashboard/health/"]
  interval: 10s
  retries: 5
```

### 8.3 No `STATIC_ROOT` / `collectstatic` configured

The Dockerfile runs `python manage.py runserver` which serves static files in dev mode. In production (Gunicorn/uWSGI), static files will 404.

**Fix:** set `STATIC_ROOT` and run `collectstatic` in the Docker build step, then serve via Nginx or WhiteNoise.

### 8.4 No `migrate` step in the Docker entrypoint

The Dockerfile `CMD` goes straight to `runserver`. If the database is fresh (new volume) it will fail because migrations haven't run.

**Fix:**
```dockerfile
CMD ["sh", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]
```

---

## 9. UX / Product Improvements

### 9.1 No loading skeletons for list pages

Most pages show a `<Loader2>` spinner while fetching. For tables with many rows, skeleton rows give a better perceived-performance experience.

### 9.2 No empty-state illustrations

When a patient list, ticket list, or invoice list is empty, the table renders with no rows and no message. Add contextual empty states ("No patients yet — add your first one").

### 9.3 Pagination UI missing everywhere

As noted in §4.4, with `PAGE_SIZE = 10` any list with 11+ records is silently truncated. Patients, tickets, invoices, employees all need a "Next / Previous" or infinite-scroll mechanism.

### 9.4 No confirmation dialog before delete

`deletePatient`, `deleteInvoice`, `deleteEmployee` fire immediately on button click. A confirmation dialog (or at minimum a toast with undo) should guard destructive actions, especially in a medical context.

### 9.5 `calendar.tsx` is stuck in December 2024

The seed events are hardcoded to `2024-12-*` and the initial `cursor` is `new Date(2024, 11, 1)`. The calendar opens two years in the past.

**Fix:** initialize with `new Date()` and fetch real appointments from the API.

---

## 10. Quick Wins (Low Effort, High Value)

These can each be done in under an hour:

1. **Fix casing imports** (`Invoices-api` → `invoices-api`, `Payments-api` → `payments-api`) — prevents Linux build failures.
2. **Add `venv/`, `db.sqlite3`, `.tanstack/`, `dist/` to `.gitignore`** — cleans up the repo immediately.
3. **Change `DEFAULT_PERMISSION_CLASSES` to `IsAuthenticated`** — closes the anonymous read vulnerability in one line.
4. **Default `DEBUG = False` and `CORS_ALLOW_ALL_ORIGINS = False`** — two one-line fixes.
5. **Add `migrate` to the Docker CMD** — prevents new-volume startup failures.
6. **Fix the `signup.tsx` endpoint** to point at `/api/accounts/register/` — unblocks user self-registration.
7. **Move `Paginated<T>` + `unwrap()` to `api.ts`** — removes 8 copies of duplicated code.
8. **Rename `roles _permission.tsx`** to `roles-permissions.tsx` — fixes the space-in-URL issue.
9. **Set `calendar.tsx` initial date to `new Date()`** — trivial but visually important.
10. **Add `healthcheck` to `docker-compose.yml`** — one-time copy-paste from the existing health endpoint.
