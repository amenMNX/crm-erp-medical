from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AuditLogEntryViewSet

router = DefaultRouter()
router.register("log", AuditLogEntryViewSet, basename="audit-log")

urlpatterns = [
    path("", include(router.urls)),
]
