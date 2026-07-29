from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class AuditLogEntry(models.Model):
    """Shared audit trail ("Historique") for any model in the project.

    One log model, reused everywhere the cahier des charges asks for action
    logging (tickets, complaints, and the general "journalisation" security
    requirement) instead of a bespoke history table per module. Any model
    can be logged by pointing content_type/object_id at it — see
    apps.audit.utils.log_action for the helper used by viewsets.
    """

    class Action(models.TextChoices):
        CREATE = "create", "Création"
        UPDATE = "update", "Modification"
        DELETE = "delete", "Suppression"
        LOGIN = "login", "Connexion"
        LOGIN_FAILED = "login_failed", "Échec de connexion"
        LOGOUT = "logout", "Déconnexion"

    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, null=True, blank=True
    )
    object_id = models.CharField(max_length=64, null=True, blank=True)
    content_object = GenericForeignKey("content_type", "object_id")

    # Kept even if the object is later deleted, so the log entry (and the
    # delete entry itself) still reads sensibly.
    object_repr = models.CharField(max_length=255, blank=True)

    action = models.CharField(max_length=20, choices=Action.choices)

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_log_entries",
    )

    # Free-form details: for UPDATE, the changed fields (old -> new); for
    # LOGIN/LOGIN_FAILED, things like the IP address; etc.
    changes = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["content_type", "object_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.get_action_display()} - {self.object_repr} ({self.created_at:%Y-%m-%d %H:%M})"
