from django.contrib.contenttypes.models import ContentType

from .models import AuditLogEntry


def log_action(instance, action, actor=None, changes=None):
    """Write one AuditLogEntry row.

    Call this from a viewset's perform_create/perform_update/perform_destroy
    (or anywhere else an action needs to be journalised) instead of writing
    to AuditLogEntry directly, so every caller stays consistent.

    - instance: the model instance the entry is about (e.g. a Ticket).
    - action: one of AuditLogEntry.Action.
    - actor: the request.user who performed the action, or None for
      system/anonymous events (e.g. a failed login attempt).
    - changes: optional dict of extra detail — for updates, pass the
      changed fields as {"field": {"old": ..., "new": ...}}.
    """
    AuditLogEntry.objects.create(
        content_type=ContentType.objects.get_for_model(type(instance)),
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        action=action,
        actor=actor if (actor is not None and getattr(actor, "is_authenticated", False)) else None,
        changes=changes or {},
    )


def log_event(action, actor=None, object_repr="", changes=None):
    """Write a log entry that isn't tied to a specific model instance —
    used for the general "journalisation" security requirement (e.g. login
    / failed login / logout events)."""
    AuditLogEntry.objects.create(
        content_type=None,
        object_id=None,
        object_repr=object_repr[:255],
        action=action,
        actor=actor if (actor is not None and getattr(actor, "is_authenticated", False)) else None,
        changes=changes or {},
    )


def diff_fields(old_data, new_data, fields):
    """Build a {field: {"old": ..., "new": ...}} dict for the fields whose
    value actually changed. old_data/new_data are plain dicts (e.g. from a
    serializer's .data before/after save)."""
    changed = {}
    for field in fields:
        old_value = old_data.get(field)
        new_value = new_data.get(field)
        if old_value != new_value:
            changed[field] = {"old": old_value, "new": new_value}
    return changed
