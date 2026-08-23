"""
URL configuration for crm_erp project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
# crm_erp/urls.py
"""
URL configuration for crm_erp project.
"""
from django.contrib import admin
from django.urls import include, path
from apps.accounts.views import TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),

    # JWT token refresh — used by the frontend's silent refresh logic.
    # The *obtain* (login) endpoint lives at /api/accounts/login/ so that
    # every login attempt goes through the audited LoginView (journalisation
    # requirement). The raw TokenObtainPairView is intentionally NOT exposed
    # here because it would bypass the audit log.
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # App URLs
    path("api/crm/", include("apps.crm.urls")),
    path("api/dashboard/", include("apps.dashboard.urls")),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/hr/", include("apps.hr.urls")),
    path("api/accounting/", include("apps.accounting.urls")),
    path("api/", include("apps.messaging.urls")),
    path("api/audit/", include("apps.audit.urls")),
    path("api/payroll/", include("apps.payroll.urls")),
    path("api/stocks/",  include("apps.stocks.urls")),
]