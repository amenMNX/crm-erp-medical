from rest_framework.response import Response
from rest_framework.views import APIView

class HealthCheckView(APIView):
    """
    A simple health check endpoint to verify that the application is running.
    """
    authentication_classes = []
    permission_classes = []
    
    def get(self, request):
        return Response(
            {
                "status": "ok",
                "service": "crm-erp-radiotherapy",
            }
        )