from django.urls import path
from .views import DashboardSummaryView
from .health import HealthCheckView
from .api_docs import ApiDocsView
urlpatterns = [
    path("summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("docs/", ApiDocsView.as_view(), name="api-docs"),
]