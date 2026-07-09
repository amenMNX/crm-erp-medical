# CRM ERP Radiotherapy - Backend

Django REST backend for a radiotherapy CRM/ERP system. It includes authentication, role-based permissions, CRM, HR, accounting, dashboard summaries, demo data, smoke checks, and automated tests.

## Stack

- Django
- Django REST Framework
- DRF token authentication
- django-filter
- SQLite for local development
- CORS support for frontend integration

## Setup

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` if you want local environment overrides.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django secret key. |
| `DJANGO_DEBUG` | Enable or disable debug mode. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated allowed hosts. |
| `DJANGO_CORS_ALLOW_ALL_ORIGINS` | Allow all CORS origins in development. |
| `DJANGO_CORS_ALLOWED_ORIGINS` | Comma-separated allowed frontend origins. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Comma-separated trusted CSRF origins. |

## Database

```powershell
python manage.py migrate
```

## Demo Data

```powershell
python manage.py seed_demo --reset
```

Demo admin:

```text
username: admin
password: admin123
```

## Run Server

```powershell
python manage.py runserver
```

Backend URL:

```text
http://127.0.0.1:8000/
```

## Authentication

Login:

```http
POST /api/accounts/login/
```

Body:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

Response:

```json
{
  "token": "your-token-here"
}
```

Use the token on protected API requests:

```http
Authorization: Token your-token-here
```

Current user:

```http
GET /api/accounts/me/
```

Logout:

```http
POST /api/accounts/logout/
```

Change password:

```http
POST /api/accounts/change-password/
```

Body:

```json
{
  "old_password": "admin123",
  "new_password": "new-password"
}
```

Changing password invalidates existing tokens, so the user must log in again.

## Roles

Full permission details are documented in [`accounts_permission.md`](accounts_permission.md).

| Role | Main Responsibility |
| --- | --- |
| `admin` | System administration and full module write access. |
| `doctor` | CRM and radiotherapy records. |
| `radiotherapist` | CRM and radiotherapy treatment records. |
| `secretary` | Patient, appointment, and CRM workflows. |
| `accountant` | Invoices and payments. |
| `hr` | Employee records. |

## Permission Summary

| Module | Read Access | Write Access |
| --- | --- | --- |
| Accounts login | Public | Public login |
| Accounts logout | Authenticated user | Authenticated user |
| Current user | Authenticated user | Not used |
| Change password | Authenticated user | Authenticated user |
| User management | Django staff/admin | Django staff/admin |
| CRM | Any authenticated user | `admin`, `doctor`, `secretary`, `radiotherapist` |
| HR | Any authenticated user | `admin`, `hr` |
| Accounting | Any authenticated user | `admin`, `accountant` |
| Dashboard summary | Any authenticated user | Read-only |
| Health check | Public | Read-only |
| API docs | Public | Read-only |

## Functionalities

### Accounts

- Token login and logout.
- Current user endpoint.
- Change own password.
- Password change invalidates existing tokens.
- Admin user management API.
- Create users with profile role, phone, and department.
- Update user profile and password.
- Deactivate users through API instead of hard delete.
- Prevent admin from deactivating their own account.
- Prevent `is_staff` from being changed through the API.
- Search, filter, order, and paginate users.

### CRM

- Manage patients.
- Manage appointments.
- Manage treatment plans.
- Manage treatment sessions.
- Search patients by name, CIN, phone, email, and medical record number.
- Filter appointments, treatment plans, and sessions by status and related records.
- Order CRM lists by useful dates and creation fields.

### HR

- Manage employees.
- Link employees to Django users when needed.
- Filter by department, contract type, and active status.
- Search by employee number, name, job title, department, email, phone, and username.

### Accounting

- Manage invoices.
- Manage payments.
- Track invoice totals, paid amount, and balance due.
- Payment create/update/delete refreshes invoice payment status.
- Filter invoices by status, patient, and treatment plan.
- Filter payments by invoice and method.
- Search invoices and payments by business identifiers and notes.

### Dashboard

- Health endpoint for uptime checks.
- API documentation endpoint listing available modules.
- Summary endpoint with CRM and accounting totals:
  - patients
  - appointments
  - treatment plans
  - treatment sessions
  - completed sessions
  - active treatment plans
  - invoices
  - payments
  - paid invoices
  - unpaid invoices
  - invoiced total
  - paid total
  - unpaid total

### Utility Commands

- `seed_demo`: creates demo data and admin user.
- `smoke_test`: verifies important demo records exist.
- `backend_check`: runs system checks, tests, migrations, demo seed, and smoke test.

## API Endpoints

### Core

```text
/admin/
/api/dashboard/health/
/api/dashboard/docs/
/api/dashboard/summary/
```

### Accounts

```text
/api/accounts/login/
/api/accounts/logout/
/api/accounts/change-password/
/api/accounts/me/
/api/accounts/users/
```

### CRM

```text
/api/crm/patients/
/api/crm/appointments/
/api/crm/treatment-plans/
/api/crm/treatment-sessions/
```

### HR

```text
/api/hr/employees/
```

### Accounting

```text
/api/accounting/invoices/
/api/accounting/payments/
```

## Query Features

Most list endpoints support pagination. Many endpoints also support:

- `search=...`
- `ordering=field`
- module-specific filters such as `status`, `patient`, `department`, `method`, `profile__role`, and `is_active`

Example:

```http
GET /api/crm/patients/?search=ali&ordering=last_name
```

## Checks

System check:

```powershell
python manage.py check
```

Tests:

```powershell
python manage.py test
```

Smoke test:

```powershell
python manage.py smoke_test
```

Full backend readiness check:

```powershell
python manage.py backend_check
```
