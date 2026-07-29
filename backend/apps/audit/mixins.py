from .models import AuditLogEntry
from .utils import diff_fields, log_action


class AuditLoggingMixin:
    """Drop into any ModelViewSet to journalise create/update/delete for
    free, instead of writing perform_create/perform_update/perform_destroy
    by hand in every module that needs it.

    Usage:
        class TicketViewSet(AuditLoggingMixin, viewsets.ModelViewSet):
            audit_tracked_fields = ["titre", "statut", "priorite"]
            ...

    `audit_tracked_fields` lists the serializer field names whose changes
    are worth recording on UPDATE (kept short on purpose — logging every
    field, including read-only/computed ones, mostly adds noise). Leave it
    empty (the default) to still log that an update happened, just without
    a field-level diff.
    """

    audit_tracked_fields: list[str] = []

    def perform_create(self, serializer):
        instance = serializer.save()
        log_action(instance, AuditLogEntry.Action.CREATE, actor=self.request.user)

    def perform_update(self, serializer):
        old_data = self.get_serializer(serializer.instance).data if self.audit_tracked_fields else {}
        instance = serializer.save()
        changes = {}
        if self.audit_tracked_fields:
            new_data = self.get_serializer(instance).data
            changes = diff_fields(old_data, new_data, self.audit_tracked_fields)
        log_action(instance, AuditLogEntry.Action.UPDATE, actor=self.request.user, changes=changes)

    def perform_destroy(self, instance):
        # Logged before delete so object_repr can still read the instance;
        # AuditLogEntry itself keeps a snapshot (object_repr) that survives
        # the row being gone.
        log_action(instance, AuditLogEntry.Action.DELETE, actor=self.request.user)
        instance.delete()
