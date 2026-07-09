# Accounts Roles And Permissions

This backend uses Django users plus an `accounts.UserProfile` role. Every user has one profile, created automatically.

## Roles

| Role | Purpose |
| --- | --- |
| `admin` | System administrator. Manages users and can write in every business module. Superusers are treated as `admin`. |
| `doctor` | Medical staff. Can create and update CRM/radiotherapy records. |
| `radiotherapist` | Radiotherapy staff. Can create and update CRM/radiotherapy records. |
| `secretary` | Front-office staff. Can create and update CRM records. |
| `accountant` | Finance staff. Can create and update invoices and payments. |
| `hr` | Human resources staff. Can create and update employee records. |

## Global Rules

| Area | Rule |
| --- | --- |
| Public endpoints | `/api/dashboard/health/`, `/api/dashboard/docs/`, and `/api/accounts/login/` are public. |
| Authenticated read access | Business module read requests are allowed for authenticated users. |
| Write access | Create, update, and delete requests require the matching role for that module. |
| Token authentication | Protected API calls can use `Authorization: Token <token>`. |
| Password changes | Changing password deletes existing auth tokens, so the user must log in again. |

## Module Permissions

| Module | Endpoints | Read | Create/Update/Delete |
| --- | --- | --- | --- |
| Accounts login | `/api/accounts/login/` | Public | Public login with username/password |
| Accounts logout | `/api/accounts/logout/` | Authenticated | Authenticated user only |
| Current user | `/api/accounts/me/` | Authenticated user only | Not used |
| Change password | `/api/accounts/change-password/` | Authenticated user only | Authenticated user can change own password |
| User management | `/api/accounts/users/` | Django staff/admin only | Django staff/admin only |
| CRM | `/api/crm/patients/`, `/api/crm/appointments/`, `/api/crm/treatment-plans/`, `/api/crm/treatment-sessions/` | Any authenticated user | `admin`, `doctor`, `secretary`, `radiotherapist` |
| HR | `/api/hr/employees/` | Any authenticated user | `admin`, `hr` |
| Accounting | `/api/accounting/invoices/`, `/api/accounting/payments/` | Any authenticated user | `admin`, `accountant` |
| Dashboard summary | `/api/dashboard/summary/` | Any authenticated user | Read-only |
| Dashboard health | `/api/dashboard/health/` | Public | Read-only |
| API docs | `/api/dashboard/docs/` | Public | Read-only |

## User Management Rules

| Action | Permission | Notes |
| --- | --- | --- |
| List users | Django staff/admin only | Supports search, filtering, ordering, and pagination. |
| Create user | Django staff/admin only | Can set username, password, email, names, active status, and profile fields. |
| Update user | Django staff/admin only | Can update profile and password. |
| Change `is_staff` | Not allowed through API | `is_staff` is read-only in the API serializer. |
| Delete user | Django staff/admin only | Performs soft delete by setting `is_active=False`. |
| Delete own account | Not allowed | Prevents an admin from deactivating themselves by mistake. |

## Role Matrix

| Role | Accounts users | CRM write | HR write | Accounting write | Dashboard summary |
| --- | --- | --- | --- | --- | --- |
| `admin` | Yes, if Django staff/admin | Yes | Yes | Yes | Yes |
| `doctor` | No | Yes | No | No | Yes |
| `radiotherapist` | No | Yes | No | No | Yes |
| `secretary` | No | Yes | No | No | Yes |
| `accountant` | No | No | No | Yes | Yes |
| `hr` | No | No | Yes | No | Yes |

## Permission Helpers In Code

| Helper | Meaning |
| --- | --- |
| `get_user_role(user)` | Returns the current user's role. Superusers return `admin`. |
| `ReadOnlyOrRole` | Allows safe methods for authenticated users; write methods require `allowed_roles`. |
| `IsAdminRole` | Allows only role `admin`. |
| `IsDoctorRole` | Allows only role `doctor`. |
| `IsSecretaryDoctorOrAdmin` | Allows `admin`, `doctor`, or `secretary`. |
| `IsAccountantOrAdmin` | Allows `admin` or `accountant`. |
| `IsHrOrAdmin` | Allows `admin` or `hr`. |
