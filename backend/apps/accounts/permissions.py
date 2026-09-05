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


def get_user_role(user) -> str | None:
    """Return the role slug for a user, or None if unauthenticated / no profile."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    profile = getattr(user, "profile", None)
    # ⭐ MODIFIED - added super_admin check
    if profile and getattr(profile, 'is_super_admin', False):
        return "super_admin"
    return profile.role if profile else None


def _has_module_permission(user, module_label: str) -> bool:
    """
    Return True if the user's RolePermission grants write access to *module_label*.

    This covers employees whose profile.role is ASSISTANT (custom department
    roles) but whose Employee.role (RolePermission) has been explicitly
    configured by a superadmin to include the module.
    """
    try:
        employee = user.employee_profile
        role_perm = employee.role
        if role_perm and module_label in (role_perm.write_permissions or []):
            return True
    except Exception:
        pass
    return False


# ⭐ NEW CLASS
class IsSuperAdmin(BasePermission):
    """Seuls les Super Admins ont accès."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        profile = getattr(request.user, 'profile', None)
        if profile and getattr(profile, 'is_super_admin', False):
            return True
        # Fallback : superuser Django
        return request.user.is_superuser


# ⭐ NEW CLASS
class IsSuperAdminOrReadOnly(BasePermission):
    """Lecture pour tous, écriture uniquement Super Admin."""
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return IsSuperAdmin().has_permission(request, view)


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
    Mutating requests (POST/PUT/PATCH/DELETE) are allowed when:
      • user's profile.role is in `allowed_roles`  (built-in roles), OR
      • user's Employee.role (RolePermission) includes `module_label`
        in its write_permissions  (custom / department roles).

    Subclass and set both attributes:

        class CrmPermission(ReadOnlyOrRole):
            allowed_roles = ["admin", "doctor", "secretary"]
            module_label  = "Patients"   # must match RolePermission.write_permissions values
    """
    allowed_roles: list[str] = []
    module_label: str = ""        # module name as stored in RolePermission.write_permissions

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        # Built-in role check
        if get_user_role(request.user) in self.allowed_roles:
            return True
        # Custom / department role check via RolePermission.write_permissions
        if self.module_label:
            return _has_module_permission(request.user, self.module_label)
        return False


# ── Module-specific write permissions ─────────────────────────────────────────

class PatientDataPermission(ReadOnlyOrRole):
    """CRM — patients, treatment plans, sessions, appointments."""
    allowed_roles = ["admin", "doctor", "secretary"]
    module_label  = "Patients"


class SupportPermission(ReadOnlyOrRole):
    """CRM — tickets, incidents, complaints."""
    allowed_roles = ["admin", "support_client", "secretary"]
    module_label  = "Tickets"


class HrPermission(ReadOnlyOrRole):
    """HR module — employees, leaves, absences, shifts, advances."""
    allowed_roles = ["admin", "hr"]
    module_label  = "Employees"


class AccountingPermission(ReadOnlyOrRole):
    """Accounting module — invoices, payments, CNAM, subscriptions."""
    allowed_roles = ["admin", "accountant"]
    module_label  = "Invoices & Payments"


class AdminOnlyPermission(BasePermission):
    """Strict admin-only gate (users, roles, audit log, system settings)."""
    def has_permission(self, request, view):
        return get_user_role(request.user) == "admin"