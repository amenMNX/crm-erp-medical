# CRM-ERP Radiotherapy — Project Overview

## Project Summary

CRM-ERP Radiotherapy is an integrated, modular web application combining CRM and ERP functionality tailored for radiotherapy clinics. The system helps manage patients, appointments, billing, HR, payroll, messaging, and clinical workflows while providing audit trails, dashboards, and APIs for integrations.

## Goals

- Provide a unified platform for operations, finance, and clinical coordination.
- Support secure patient and staff data handling following privacy best practices.
- Enable integrations with hospital systems, imaging platforms, and third-party billing services.
- Offer an extensible architecture so new modules (e.g., oncology-specific tools) can be added.

## Key Features

- Patient and contact management (CRM)
- Appointments and scheduling
- Accounting and billing workflows
- Payroll and HR management
- Messaging and notifications
- Audit log and activity tracking
- Dashboards and metrics for operations and finance
- REST APIs and frontend SPA built with TypeScript

## Repository Structure (high level)

- `backend/` — Django project and apps (accounts, crm, accounting, dashboard, hr, messaging, payroll, audit, etc.).
  - `backend/manage.py` — Django management entrypoint.
  - `backend/crm_erp/` — Django project settings and WSGI/ASGI.
  - `backend/apps/` — modular Django apps for domain logic.
- `frontend/` — TypeScript + Vite single-page app (React / Preact-compatible routing and components).
- `docker-compose.yml` — Compose setup for local development services.
- `README.md` — Project-level README with summary and links.

## Architecture Overview

The system uses a standard split: a Django REST backend providing JSON APIs and a TypeScript SPA consuming them. The backend stores data in a relational database (SQLite in repository for local dev; production uses PostgreSQL or MySQL). The app is designed to run in containers for reproducible deployments.

Components:

- API layer: Django REST endpoints defined across apps (serializers, views, urls).
- Auth: JWT/session-backed authentication with granular permissions per app.
- Frontend: Vite-powered SPA with modular routes and domain-specific API clients in `frontend/src/lib`.
- Background tasks: Short-lived management commands and periodic jobs (cron or Celery recommended in production).

## Technology Stack

- Backend: Python 3.x, Django, Django REST Framework
- Frontend: TypeScript, Vite, React-compatible components
- Database: SQLite for dev (backend/db.sqlite3 present), PostgreSQL recommended for prod
- Containers: Docker, Docker Compose

## Local Development

Prerequisites:

- Install Docker and Docker Compose (recommended)
- Alternatively: Python 3.10+, Node 18+, pip, and npm/yarn

Start with Docker Compose (recommended):

```bash
docker-compose up --build
```

If running locally without Docker (backend):

```bash
# create virtualenv
python -m venv .venv
source .venv/Scripts/activate   # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Frontend (local dev):

```bash
cd frontend
npm install
npm run dev
```

Environment variables:

- The backend reads configuration from environment variables (database URL, secret key, allowed hosts). For local development, copy or create a `.env` file following `backend/README.md` (or `docker-compose.yml` environment section).

## Database & Migrations

- Migrations:
  - Django migrations live inside each app's `migrations/` directory. Use `python manage.py makemigrations` and `python manage.py migrate` to manage schema changes.
  - Workflow: develop schema changes on a feature branch, run `makemigrations` locally, add migration files to the PR, and run `migrate` in CI against a test database to validate.
  - Rollbacks: avoid destructive operations in a single migration. Prefer multi-step migrations (create new column, backfill, switch reads, drop old column).

- Production database recommendations:
  - Use PostgreSQL (managed service like RDS, Cloud SQL or Azure Database) for reliability and backups.
  - Configure secure network access, TLS, and least-privilege DB users.
  - Enable automated backups and point-in-time recovery where available.

- Backups & maintenance:
  - Schedule daily logical and/or physical backups; test restores periodically.
  - For large datasets, use logical exports or filesystem snapshots depending on DB type and provider.


## Testing

- Local tests:
  - Backend: from `backend/` run:

    ```bash
    cd backend
    python manage.py test
    ```

  - Frontend: from `frontend/` run:

    ```bash
    cd frontend
    npm test
    ```

- Test strategy:
  - Unit tests for models, serializers, utilities and small components.
  - Integration tests for critical API flows (appointment creation, billing workflow).
  - End-to-end smoke tests covering login, basic CRUD and major workflows (optional, can use Playwright or Cypress).
 


## Linting and Formatting

- Backend: Use `flake8`/`black` as configured in `backend/requirements.txt` or developer docs.
- Frontend: Use `eslint` and consistent `prettier` rules defined in `frontend/`.


## Deployment

Recommended production setup:

- Backend: containerized Django app served by Gunicorn (WSGI) or Uvicorn/Daphne (ASGI for websockets) behind Nginx.
- Frontend: build static assets (`npm run build`) and serve via a CDN or static site host (Netlify, Vercel, or Nginx + CDN).
- Database: PostgreSQL (managed) with TLS and automated backups.
- Secrets: use a secrets manager (AWS Secrets Manager, Azure Key Vault, or environment variables injected by orchestrator).

Deployment checklist:

1. Build and tag backend and frontend Docker images.
2. Run database migrations in a maintenance window if schema changes are non-trivial.
3. Run smoke tests after deployment to validate critical flows.
4. Monitor logs and metrics; ensure alerting on error rates and high latency.

Suggested deployment options:

- Simple: Docker Compose with machines or single VM for small installations.
- Scalable: Kubernetes or managed container services (EKS/GKE/AKS) with an ingress controller, autoscaling, and persistent volumes for backups.

Rollback strategy:

- Keep previous stable image tags; when a deploy fails, roll back to the last known-good tag and investigate migrations/state changes before reapplying.


## APIs and Integration

- The backend exposes REST APIs grouped by app (see `backend/apps/*/urls.py` and `serializers.py`).
- Clients should authenticate using the configured auth flow (session or token/JWT).
- Provide API documentation endpoints (e.g., OpenAPI/Swagger) — `backend/dashboard/api_docs.py` hints at available docs.

## App-specific API Summary

Below is a concise map of the main API modules, routes, and important behaviors. Refer to each app's `urls.py`, `views.py`, and `serializers.py` for full details.

- `accounts` (authentication & users)
  - Endpoints:
    - `POST /api/accounts/login/` — issue JWT (HttpOnly cookies)
    - `POST /api/accounts/logout/` — revoke refresh token
    - `GET/POST /api/accounts/users/` — user management via `UserViewSet`
    - `GET /api/accounts/me/` — current user profile
    - `POST /api/accounts/register/` — public registration (if enabled)
  - Notes: JWT-only auth, tight login throttling, admin-only write operations for users.

- `crm` (patients, appointments, tickets, treatment plans)
  - Base path: `/api/crm/`
  - Major resources: `patients`, `appointments`, `treatment-plans`, `treatment-sessions`, `machines`, `rooms`, `tickets`, `complaints`, `incidents`.
  - Special endpoints:
    - `GET /api/crm/patients/{id}/360/` — consolidated patient dossier (custom action)
    - Public portal: `/api/crm/portal/tickets/submit/`, `/api/crm/portal/tickets/status/`, `/api/crm/portal/complaints/submit/`, `/api/crm/portal/complaints/status/` (Anon access with throttling)
  - Permissions: clinical roles (admin, doctor, secretary, radiotherapist) for CRU(D) operations; support roles for tickets/complaints.

- `accounting` (invoices, payments, CNAM claims)
  - Base path: `/api/accounting/`
  - Resources: `invoices`, `payments`, `invoice-line-items`, `outgoing-payments`, `cnam-claims`, `subscription-plans`, `subscription-changes`.
  - Notes: invoice serializer supports nested `line_items`; subscription changes are append-only (immutable via API).
  - Permissions: accountant/admin roles for write operations.

- `hr` (employees, leave, absences, shifts)
  - Base path: `/api/hr/`
  - Resources: `employees`, `leave-requests`, `absences`, `salary-advances`, `shifts`.
  - Actions: leave and salary-advance approval endpoints (`POST /.../{id}/approve/`, `/reject/`, `/mark_repaid/`).
  - Permissions: HR/admin roles.

- `payroll` (payroll generation and batches)
  - Base path: `/api/payroll/`
  - Resources: `employee-salaries`, `payroll-batches`, `payrolls`, `payroll-components`, `generate-payroll`.
  - Actions: `POST /api/payroll/generate-payroll/generate/` to generate a payroll batch for a month; batch approval and mark-paid actions available.
  - Permissions: admin, hr, accountant roles.

- `messaging` (messages & notifications)
  - Base path: `/api/messaging/`
  - Endpoints: `notifications` (list, unread-count, mark-all-read), `messages` (user-to-user messaging); authenticated only.

- `dashboard` and `health` (monitoring & docs)
  - `GET /api/dashboard/summary/` — role-aware metrics summary
  - `GET /api/dashboard/health/` — unauthenticated health check
  - `GET /api/dashboard/docs/` — lightweight API docs and module map

- `audit` (audit log)
  - Base path: `/api/audit/log/` (read-only)
  - Admin-only: view audit entries; entries are created internally and not modifiable via API.

API discovery: Use the dashboard API docs (`/api/dashboard/docs/`) during development to get a high-level map of available endpoints and required roles.


## Observability

- Logging: Centralize logs (stdout for containers), integrate with ELK/Cloud logging.
- Monitoring: Expose health endpoints (see `backend/apps/dashboard/health.py`) and add metrics collection (Prometheus/Grafana).

## Security Considerations

- Secure all admin and management interfaces behind authentication and network-level controls.
- Protect sensitive PII: encrypt data at rest if necessary and use TLS in transit.
- Regularly rotate keys and credentials; do not commit secrets to the repository.

## Contributing

- Follow the branching model: feature branches -> pull request -> code review -> merge.
- Include tests for new logic and run linters before submitting PRs.
- Update `about.md` or `README.md` when making changes that affect developers or deployment.

## Roadmap & Next Steps

- Stabilize core workflows: appointments, billing, and audit trails.
- Add integration adapters for hospital systems (HL7/FHIR or custom connectors).
- Implement background job processing with Celery or an equivalent.

## Contacts and Maintainers

- Primary maintainer: (add name and email)
- Backend lead: (add name)
- Frontend lead: (add name)

## Appendix — Useful Commands

- Start dev stack: `docker-compose up --build`
- Run backend tests: `cd backend && python manage.py test`
- Run frontend dev server: `cd frontend && npm run dev`

---

