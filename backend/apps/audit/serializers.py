from rest_framework import serializers

from .models import AuditLogEntry


class AuditLogEntrySerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", default=None, read_only=True)
    model_name = serializers.CharField(source="content_type.model", default=None, read_only=True)
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AuditLogEntry
        fields = [
            "id",
            "model_name",
            "object_id",
            "object_repr",
            "action",
            "action_display",
            "actor",
            "actor_username",
            "changes",
            "created_at",
        ]
        read_only_fields = fields
