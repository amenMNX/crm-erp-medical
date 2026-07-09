from rest_framework.response import Response
from rest_framework.views import APIView

class ApiDocsView(APIView):
    """
    A simple API documentation endpoint to provide information about the available API endpoints.
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(
            {
                "service": "crm-erp-radiotherapy",
                "roles": [
                    "admin",
                    "doctor",
                    "radiotherapist",
                    "secretary",
                    "accountant",
                    "hr",
                ],
                "permissions": {
                    "crm": {
                        "read": "authenticated",
                        "write": ["admin", "doctor", "secretary", "radiotherapist"],
                    },
                    "hr": {
                        "read": "authenticated",
                        "write": ["admin", "hr"],
                    },
                    "accounting": {
                        "read": "authenticated",
                        "write": ["admin", "accountant"],
                    },
                    "dashboard_summary": {
                        "read": "authenticated",
                        "write": [],
                    },
                    "accounts_users": {
                        "read": "staff/admin",
                        "write": "staff/admin",
                    },
                },
                "modules": {
                    "accounts": {
                        "login": "/api/accounts/login/",
                        "logout": "/api/accounts/logout/",
                        "change_password": "/api/accounts/change-password/",
                        "users": "/api/accounts/users/",
                        "me": "/api/accounts/me/",
                    },
                    "crm": {
                        "patients": "/api/crm/patients/",
                        "appointments": "/api/crm/appointments/",
                        "treatment_plans": "/api/crm/treatment-plans/",
                        "treatment_sessions": "/api/crm/treatment-sessions/",
                    },
                    "hr": {
                        "employees": "/api/hr/employees/",
                    },
                    "accounting": {
                        "invoices": "/api/accounting/invoices/",
                        "payments": "/api/accounting/payments/",
                    },
                    "dashboard": {
                        "summary": "/api/dashboard/summary/",
                        "health": "/api/dashboard/health/",
                        "docs": "/api/dashboard/docs/",
                    },
                },
            }
        )