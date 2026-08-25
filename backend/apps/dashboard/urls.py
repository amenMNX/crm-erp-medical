from django.urls import path
from .views import (
    DashboardSummaryView,
    KpiDashboardView,
    ExportTicketsView,
    ExportPatientsView,
    ExportInvoicesView,
    ExportRevenueView,
    ExportSessionsView,
)
from .health import HealthCheckView
from .api_docs import ApiDocsView

urlpatterns = [
    path("summary/",         DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("kpi/",             KpiDashboardView.as_view(),     name="dashboard-kpi"),
    path("health/",          HealthCheckView.as_view(),      name="health-check"),
    path("docs/",            ApiDocsView.as_view(),          name="api-docs"),
    path("export/tickets/",  ExportTicketsView.as_view(),   name="export-tickets"),
    path("export/patients/", ExportPatientsView.as_view(),  name="export-patients"),
    path("export/invoices/", ExportInvoicesView.as_view(),  name="export-invoices"),
    path("export/revenue/",  ExportRevenueView.as_view(),   name="export-revenue"),
    path("export/sessions/", ExportSessionsView.as_view(),  name="export-sessions"),
]