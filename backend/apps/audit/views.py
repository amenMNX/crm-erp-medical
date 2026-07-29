from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from apps.accounts.permissions import IsAdminRole

from .models import AuditLogEntry
from .serializers import AuditLogEntrySerializer


class AuditLogEntryViewSet(viewsets.ReadOnlyModelViewSet):
    # Read-only on purpose: entries are only ever written internally via
    # apps.audit.utils.log_action, never through this API. Admin-only,
    # since the log can reveal who did what across every module.
    queryset = AuditLogEntry.objects.select_related("actor", "content_type").all()
    serializer_class = AuditLogEntrySerializer
    permission_classes = [IsAdminRole]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["action", "actor", "content_type", "object_id"]
    search_fields = ["object_repr", "actor__username"]
    ordering_fields = ["created_at"]
