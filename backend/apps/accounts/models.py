from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        DOCTOR = "doctor", "Doctor"
        RADIOTHERAPIST = "radiotherapist", "Radiotherapist"
        SECRETARY = "secretary", "Secretary"
        ACCOUNTANT = "accountant", "Accountant"
        RESPONSABLE_HR = "hr", "HR"
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
    department = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.role}"

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