# apps/accounts/signals.py
from django.contrib.auth.models import User
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .models import UserProfile

# ── Constants ─────────────────────────────────────────────────────────────────

# Roles that represent real staff members who should also have an Employee
# record in the HR module.
#
# ASSISTANT is intentionally excluded — it is the lowest-privilege role used
# for patients and self-registered users who are NOT employees.
_EMPLOYEE_ROLES = {
    UserProfile.Role.ADMIN,
    UserProfile.Role.DOCTOR,
    UserProfile.Role.SECRETARY,
    UserProfile.Role.ACCOUNTANT,
    UserProfile.Role.RESPONSABLE_HR,
    UserProfile.Role.SUPPORT_CLIENT,
    UserProfile.Role.MANAGER,
    UserProfile.Role.RECEPTIONIST,
    # ASSISTANT excluded — patients and plain self-registered users land here
}

# ── Signals ───────────────────────────────────────────────────────────────────

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create a blank UserProfile whenever a new Django User is saved."""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(pre_save, sender=UserProfile)
def _capture_previous_role(sender, instance, **kwargs):
    """
    Stash the role that is currently in the DB on the instance so the
    post_save receiver can compare old → new without an extra query.
    New profiles (pk=None) get _previous_role = None.
    """
    if instance.pk:
        try:
            instance._previous_role = (
                UserProfile.objects.values_list("role", flat=True).get(pk=instance.pk)
            )
        except UserProfile.DoesNotExist:
            instance._previous_role = None
    else:
        instance._previous_role = None


@receiver(post_save, sender=UserProfile)
def sync_employee_on_role_change(sender, instance, created, **kwargs):
    """
    React to role changes on UserProfile:

    Case 1 — Profile just created (created=True):
        Skip entirely. New profiles always start with the model default role;
        an admin hasn't explicitly promoted this user yet.

    Case 2 — Role changed TO an employee role:
        • If the user already has an Employee record → sync its RolePermission
          FK and job_title to match the new role, and update profile.department.
        • If no Employee record exists yet → create one with sensible defaults
          so the HR team can complete it (salary, department, hire date, etc.).

    Case 3 — Role changed AWAY FROM an employee role:
        The Employee record is left in place but marked inactive so HR history
        is preserved. The HR team can re-activate it if the user returns.

    Case 4 — Role didn't change:
        Skip (nothing to do).
    """
    # ── Case 1: brand-new profile — do nothing ────────────────────────────────
    if created:
        return

    previous_role = getattr(instance, "_previous_role", None)
    new_role = instance.role

    # ── Case 4: no change ─────────────────────────────────────────────────────
    if previous_role == new_role:
        return

    user = instance.user

    # ── Case 2: promoted TO an employee role ──────────────────────────────────
    if new_role in _EMPLOYEE_ROLES:
        try:
            existing = user.employee_profile
            _sync_employee_role(existing, new_role, instance)
        except Exception:
            _create_employee_for_user(user, new_role, instance)
        return

    # ── Case 3: demoted AWAY from an employee role ────────────────────────────
    if previous_role in _EMPLOYEE_ROLES:
        try:
            employee = user.employee_profile
            if employee.is_active:
                employee.is_active = False
                employee.save(update_fields=["is_active", "updated_at"])
        except Exception:
            pass  # No employee record — nothing to deactivate


# ── Helpers ───────────────────────────────────────────────────────────────────

# Built-in role → canonical department slug used in UserProfile.department.
# This lets the dashboard and permission checks resolve a user's department
# from their profile without touching the HR module.
_ROLE_TO_DEPARTMENT: dict[str, str] = {
    UserProfile.Role.DOCTOR:         "medical",
    UserProfile.Role.ACCOUNTANT:     "finance",
    UserProfile.Role.RESPONSABLE_HR: "hr",
    UserProfile.Role.SUPPORT_CLIENT: "support",
    UserProfile.Role.RECEPTIONIST:   "support",
    UserProfile.Role.SECRETARY:      "support",
    # ADMIN and MANAGER are cross-department — leave department blank
    # so they are not filtered into one silo.
}


def _generate_employee_number() -> str:
    """
    Auto-generate a unique employee number in the format EMP-NNNN.
    Collisions are handled by incrementing until a free slot is found.
    The unique DB constraint on employee_number is the final safety net.
    """
    from apps.hr.models import Employee

    last = Employee.objects.order_by("-id").first()
    next_id = (last.id + 1) if last else 1
    candidate = f"EMP-{next_id:04d}"
    while Employee.objects.filter(employee_number=candidate).exists():
        next_id += 1
        candidate = f"EMP-{next_id:04d}"
    return candidate


def _sync_employee_role(employee, new_role: str, profile: UserProfile) -> None:
    """
    Update the RolePermission FK and job_title on an existing Employee to
    match a newly assigned UserProfile role, and keep profile.department in sync.
    """
    from apps.accounts.models import RolePermission

    role_perm = RolePermission.objects.filter(role_name__iexact=new_role).first()
    role_label = dict(UserProfile.Role.choices).get(new_role, new_role.title())

    changed_fields = []
    if role_perm and employee.role_id != role_perm.pk:
        employee.role = role_perm
        changed_fields.append("role")
    if employee.job_title != role_label:
        employee.job_title = role_label
        changed_fields.append("job_title")
    if not employee.is_active:
        employee.is_active = True
        changed_fields.append("is_active")

    if changed_fields:
        changed_fields.append("updated_at")
        employee.save(update_fields=changed_fields)

    # Keep UserProfile.department in sync with the new built-in role.
    # Use update() instead of save() so no post_save signal is fired,
    # avoiding a re-entrant call to sync_employee_on_role_change.
    new_dept = _ROLE_TO_DEPARTMENT.get(new_role, "")
    if profile.department != new_dept:
        UserProfile.objects.filter(pk=profile.pk).update(department=new_dept)
        profile.department = new_dept   # keep the in-memory instance consistent


def _create_employee_for_user(user: User, role: str, profile: UserProfile) -> None:
    """
    Create a minimal Employee record for a user who has just been promoted
    to a staff role by an admin.

    Fields that HR needs to fill in later (salary, hire date, etc.) are left
    at their model defaults so the record is immediately visible in the HR
    module without blocking the role-change operation.

    Also updates profile.department to match the built-in role's department so
    the dashboard and permission checks work without querying the HR module.
    """
    from django.utils import timezone
    from apps.hr.models import Employee
    from apps.accounts.models import RolePermission

    role_perm = RolePermission.objects.filter(role_name__iexact=role).first()
    role_label = dict(UserProfile.Role.choices).get(role, role.title())
    dept = _ROLE_TO_DEPARTMENT.get(role, "")

    Employee.objects.create(
        user=user,
        employee_number=_generate_employee_number(),
        first_name=user.first_name or user.username,
        last_name=user.last_name or "",
        email=user.email or "",
        job_title=role_label,
        hire_date=timezone.now().date(),
        role=role_perm,   # may be None if RolePermission not seeded yet; HR can set it
        is_active=True,
    )

    # Stamp the department on the profile so it's always queryable.
    # Use update() to avoid re-triggering post_save on UserProfile.
    if dept and profile.department != dept:
        UserProfile.objects.filter(pk=profile.pk).update(department=dept)
        profile.department = dept   # keep the in-memory instance consistent