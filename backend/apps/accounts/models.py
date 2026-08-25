# apps/accounts/models.py
from django.conf import settings
from django.db import models

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]

class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        DOCTOR = "doctor", "Doctor"
        SECRETARY = "secretary", "Secretary"
        ACCOUNTANT = "accountant", "Accountant"
        HR = "hr", "HR"
        SUPPORT_CLIENT = "support_client", "Support Client"
        MANAGER = "manager", "Manager"
        RECEPTIONIST = "receptionist", "Receptionist"
        ASSISTANT = "assistant", "Assistant"
        
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.SECRETARY,
    )
    phone = models.CharField(max_length=30, blank=True)
    department_old = models.CharField(max_length=100, blank=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    
    # ⭐ NEW FIELD
    is_super_admin = models.BooleanField(
        default=False,
        help_text="Super Administrateur (accès total au système)"
    )

    def __str__(self):
        # ⭐ MODIFIED
        role_display = self.get_role_display()
        suffix = " 👑" if self.is_super_admin else ""
        return f"{self.user.username} - {role_display}{suffix}"
        
        
class CustomRole(models.Model):
    """User-defined roles created by admins in the Roles & Permissions screen.

    Built-in roles (admin, doctor, hr, …) live as choices on UserProfile.role
    and are enforced in view permission classes.  CustomRole stores the extra
    roles an admin invents (e.g. "Physicien", "Technicien") together with
    which modules they can write to.  The frontend uses this table as its
    source of truth instead of localStorage.
    """

    name = models.CharField(max_length=100, unique=True)
    # JSON array of module name strings the role can write to.
    # e.g. ["CRM", "HR"]  — matches the module labels used in the frontend.
    write_permissions = models.JSONField(default=list, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_roles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class RolePermission(models.Model):
    """Stores permissions for ALL roles (both built-in and custom).
    
    This works alongside CustomRole to provide a unified permission system.
    Built-in roles get entries here so their permissions can be modified
    through the UI. Custom roles also get entries here.
    """
    role_name = models.CharField(max_length=100, unique=True, db_index=True)
    is_built_in = models.BooleanField(default=False)
    write_permissions = models.JSONField(default=list, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["role_name"]
        verbose_name = "Role Permission"
        verbose_name_plural = "Role Permissions"

    def __str__(self):
        return f"{self.role_name} ({'built-in' if self.is_built_in else 'custom'})"