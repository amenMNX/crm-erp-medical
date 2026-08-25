# apps/accounts/permissions.py

"""
RBAC permission classes for the CRM/ERP platform.

Architecture
────────────
Every view that requires role-based access uses one of the classes below.

Resolution order for write access on a mutating request:
  1. Superuser → always allowed.
  2. profile.role in allowed_roles (built-in role list) → allowed.
  3. Employee.role (RolePermission) has the module label in write_permissions
     → allowed.  This is what enables custom/department roles (e.g. "Phy")
     to write to the modules the superadmin has explicitly granted them.
  4. Otherwise → 403.

Read (SAFE_METHODS) is always allowed for any authenticated user.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .models import RolePermission


def get_user_role(user) -> str | None:
    """Return the role slug for a user, or None if unauthenticated / no profile."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    profile = getattr(user, "profile", None)
    if profile and getattr(profile, 'is_super_admin', False):
        return "super_admin"
    return profile.role if profile else None


def _has_module_permission(user, module_label: str) -> bool:
    """Return True if the user has write access to *module_label*.

    Checks both the UserProfile built-in role and the employee custom role,
    mirroring what MyPermissionsView returns to the frontend so the two are
    always in sync.

    A ``noview:<module>`` entry in write_permissions is an *explicit denial* —
    it revokes view (and therefore write) access even when the module name
    itself is also present.  We honour that here on the API side.
    """
    if not user or not user.is_authenticated:
        return False

    deny_key = f"noview:{module_label}"

    def _check_perm_list(perms: list) -> bool | None:
        """
        Return True  → explicitly granted (module_label in list, no noview denial)
        Return False → explicitly denied (noview: key present)
        Return None  → not mentioned either way
        """
        if deny_key in perms:
            return False        # explicit denial overrides everything
        if module_label in perms:
            return True
        return None

    # ── Source 1: UserProfile.role → RolePermission ───────────────────────
    profile = getattr(user, "profile", None)
    if profile and profile.role:
        try:
            role_perm = RolePermission.objects.filter(
                role_name__iexact=profile.role
            ).first()
            if role_perm:
                result = _check_perm_list(role_perm.write_permissions or [])
                if result is False:
                    return False    # hard deny — don't check employee role
                if result is True:
                    pass            # tentatively granted; still check employee role for deny
        except Exception:
            pass

    # ── Source 2: employee_profile.role → custom RolePermission ──────────
    try:
        employee = user.employee_profile
        if employee and employee.role:
            result = _check_perm_list(employee.role.write_permissions or [])
            if result is False:
                return False
            if result is True:
                return True
    except Exception:
        pass

    # Fall back to profile role grant from source 1 (re-query to avoid variable capture issues)
    profile = getattr(user, "profile", None)
    if profile and profile.role:
        try:
            role_perm = RolePermission.objects.filter(
                role_name__iexact=profile.role
            ).first()
            if role_perm:
                return module_label in (role_perm.write_permissions or [])
        except Exception:
            pass

    return False


# ⭐ Super Admin Classes
class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, 'profile', None)
        if profile and getattr(profile, 'is_super_admin', False):
            return True
        return request.user.is_superuser


class IsSuperAdminOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return IsSuperAdmin().has_permission(request, view)


# ── Single-role guards ────────────────────────────────────────────────────────

class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ("admin", "super_admin")


class IsDoctorRole(BasePermission):
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
    allowed_roles: list[str] = []
    module_label: str = ""

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        if get_user_role(request.user) in self.allowed_roles:
            return True
        if self.module_label:
            return _has_module_permission(request.user, self.module_label)
        return False


# ── Module-specific write permissions ─────────────────────────────────────────

class CrmPermission(ReadOnlyOrRole):
    """CRM — patients, treatment plans, sessions, appointments."""
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]
    module_label = "Patients"


class PatientDataPermission(ReadOnlyOrRole):
    """CRM — patients, treatment plans, sessions, appointments."""
    allowed_roles = ["admin", "doctor", "secretary", "radiotherapist"]
    module_label = "Patients"


class TicketPermission(ReadOnlyOrRole):
    """CRM — tickets, incidents, complaints."""
    allowed_roles = ["admin", "support_client", "secretary"]
    module_label = "Tickets"


class SupportPermission(ReadOnlyOrRole):
    """CRM — tickets, incidents, complaints."""
    allowed_roles = ["admin", "support_client", "secretary"]
    module_label = "Tickets"


class HrPermission(ReadOnlyOrRole):
    """HR module — employees, leaves, absences, shifts, advances."""
    allowed_roles = ["admin", "hr"]
    # "Employés" matches the French name stored in RolePermission.write_permissions
    module_label = "Employés"


class AccountingPermission(ReadOnlyOrRole):
    """Accounting module — invoices, payments, CNAM, subscriptions."""
    allowed_roles = ["admin", "accountant"]
    # "Factures" is the canonical name; covers the whole accounting module
    module_label = "Factures"


class AdminOnlyPermission(BasePermission):
    """Strict admin-only gate (users, roles, audit log, system settings)."""
    def has_permission(self, request, view):
        return get_user_role(request.user) in ("admin", "super_admin")


class PayrollPermission(ReadOnlyOrRole):
    """Payroll module — salaries, bonuses, deductions."""
    allowed_roles = ["admin", "accountant", "hr"]
    module_label = "Paie"


class MessagingPermission(ReadOnlyOrRole):
    """Messaging module — notifications, emails, SMS."""
    allowed_roles = ["admin", "hr", "doctor", "secretary"]
    module_label = "Messages"


class StocksPermission(ReadOnlyOrRole):
    """Stocks module — inventory, supplies, equipment."""
    allowed_roles = ["admin", "secretary"]
    module_label = "Stocks médicaux"