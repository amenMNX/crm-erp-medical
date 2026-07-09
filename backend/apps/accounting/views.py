from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from apps.accounts.permissions import ReadOnlyOrRole
from .models import Invoice, Payment
from .serializers import InvoiceSerializer, PaymentSerializer

class AccountingPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "accountant"]
    
class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("patient", "treatment_plan").all()
    serializer_class = InvoiceSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient", "treatment_plan"]
    search_fields = [
        "invoice_number",
        "patient__first_name",
        "patient__last_name",
        "patient__medical_record_number",
        "notes",
    ]
    ordering_fields = ["issue_date", "due_date", "total_amount", "created_at"]

class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related("invoice").all()
    serializer_class = PaymentSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice", "method"]
    search_fields = [
        "payment_number",
        "invoice__invoice_number",
        "reference",
        "notes",
    ]
    ordering_fields = ["payment_date", "amount", "created_at"]