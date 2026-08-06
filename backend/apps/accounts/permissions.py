"""
RBAC permission classes for the CRM/ERP platform.

Architecture
────────────
Every view that requires role-based access uses one of the classes below.
The helper `get_user_role()` is the single source of truth for resolving the
active role from request.user — it handles superuser, missing profile, etc.

Role hierarchy (highest → lowest privilege):
  admin  >  doctor  >  secretary / radiotherapist / hr / accountant / support_client

Module ownership matrix (matches cahier des charges §6.1):
  CRM patients/plans/sessions : admin, doctor, secretary, radiotherapist
  CRM tickets/incidents       : admin, support_client, secretary
  HR                          : admin, hr
  Accounting                  : admin, accountant
  Users / roles               : admin only  (enforced in UserViewSet.get_permissions)
"""

from rest_framework.permissions import BasePermission, SAFE_METHODS


def get_user_role(user) -> str | None:
    """Return the role slug for a user, or None if unauthenticated / no profile."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    profile = getattr(user, "profile", None)
    return profile.role if profile else None


# ── Single-role guards ────────────────────────────────────────────────────────

class IsAdminRole(BasePermission):
    """Only users with role == 'admin' (or superuser)."""
    def has_permission(self, request, view):
        return get_user_role(request.user) == "admin"


class IsDoctorRole(BasePermission):
    """Only users with role == 'doctor'."""
    def has_permission(self, request, view):
        return get_user_role(request.user) == "doctor"


# ── Multi-role guards ─────────────────────────────────────────────────────────

class IsSecretaryDoctorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ("admin", "doctor", "secretary")


class IsAccountantOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ("admin", "accountant")


class IsHrOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ("admin", "hr")


# ── Generic role-based permission ─────────────────────────────────────────────

class ReadOnlyOrRole(BasePermission):
    """Base class for module-level permission.

    Any authenticated user may perform safe (read-only) requests.
    Mutating requests (POST/PUT/PATCH/DELETE) require the user's role to be
    in `allowed_roles`.

    Subclass and set `allowed_roles` to use:

        class CrmPermission(ReadOnlyOrRole):
            allowed_roles = ["admin", "doctor", "secretary"]
    """
    allowed_roles: list[str] = []

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return get_user_role(request.user) in self.allowed_roles


# ── Module-specific write permissions (object-level) ─────────────────────────

class PatientDataPermission(ReadOnlyOrRole):
    """CRM — patients, treatment plans, sessions, appointments.

    Write access: admin, doctor, secretary, radiotherapist.
    Read access:  any authenticated user (including accountant for billing).
    """
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]


class SupportPermission(ReadOnlyOrRole):
    """CRM — tickets, incidents, complaints.

    Write access: admin, support_client, secretary.
    Read access:  any authenticated user.
    """
    allowed_roles = ["admin", "support_client", "secretary"]


class HrPermission(ReadOnlyOrRole):
    """HR module — employees, leaves, absences, shifts, advances.

    Write access: admin, hr.
    Read access:  any authenticated user (managers need to see their team).
    """
    allowed_roles = ["admin", "hr"]


class AccountingPermission(ReadOnlyOrRole):
    """Accounting module — invoices, payments, CNAM, subscriptions.

    Write access: admin, accountant.
    Read access:  any authenticated user (doctors see billing status).
    """
    allowed_roles = ["admin", "accountant"]


class AdminOnlyPermission(BasePermission):
    """Strict admin-only gate (users, roles, audit log, system settings)."""
    def has_permission(self, request, view):
        role = get_user_role(request.user)
        return role == "admin"