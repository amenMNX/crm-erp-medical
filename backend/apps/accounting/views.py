from django.db.models import Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.accounts.permissions import ReadOnlyOrRole
from .models import (
    CNAMClaim, DunningAction, Invoice, InvoiceLineItem,
    OutgoingPayment, Payment, SubscriptionChange, SubscriptionPlan,
)
from .serializers import (
    CNAMClaimSerializer, DunningActionSerializer, InvoiceLineItemSerializer,
    InvoiceSerializer, OutgoingPaymentSerializer, PaymentSerializer,
    SubscriptionChangeSerializer, SubscriptionPlanSerializer,
)


class AccountingPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "accountant"]


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("patient", "treatment_plan").prefetch_related("line_items").all()
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


class CNAMClaimViewSet(viewsets.ModelViewSet):
    queryset = CNAMClaim.objects.select_related("patient", "invoice").all()
    serializer_class = CNAMClaimSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "patient", "invoice"]
    search_fields = ["cnam_number", "patient__first_name", "patient__last_name", "invoice__invoice_number"]
    ordering_fields = ["created_at", "amount_claimed", "amount_reimbursed"]


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    """Admin-managed list of available subscription plans."""
    queryset = SubscriptionPlan.objects.all()
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "description"]


class SubscriptionChangeViewSet(viewsets.ModelViewSet):
    """Immutable log of patient subscription changes.

    POST creates a new change record (recorded_by is set automatically).
    PUT/PATCH/DELETE are disabled — the history is append-only.
    """
    queryset = SubscriptionChange.objects.select_related(
        "patient", "previous_plan", "new_plan", "recorded_by"
    ).all()
    serializer_class = SubscriptionChangeSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "new_plan", "reason"]
    search_fields = ["patient__first_name", "patient__last_name", "notes"]
    ordering_fields = ["effective_date", "created_at"]

    def update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Subscription change records are immutable."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Subscription change records cannot be deleted."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class OutgoingPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only list of outgoing payments (salary advances, supplier payments, etc.)
    Auto-created by signals — manual creation is via admin only.
    GET /api/accounting/outgoing-payments/
    GET /api/accounting/outgoing-payments/{id}/
    """
    queryset = OutgoingPayment.objects.all()
    serializer_class = OutgoingPaymentSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "method"]
    search_fields = ["reference", "description"]
    ordering_fields = ["payment_date", "amount", "created_at"]


class DunningActionViewSet(viewsets.ModelViewSet):
    """
    Journal de recouvrement — relances sur factures impayées.

    GET  /api/accounting/dunning/                     — liste (filtrée par invoice, level)
    GET  /api/accounting/dunning/?invoice=<id>        — actions d'une facture
    GET  /api/accounting/dunning/overdue-invoices/    — factures en retard avec leur palier courant
    POST /api/accounting/dunning/                     — enregistrer une action de relance
    PUT/PATCH/DELETE sont désactivés (journal immuable)
    """

    queryset = DunningAction.objects.select_related(
        "invoice__patient", "recorded_by"
    ).all()
    serializer_class = DunningActionSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice", "level", "method"]
    search_fields = [
        "invoice__invoice_number",
        "invoice__patient__first_name",
        "invoice__patient__last_name",
        "notes",
    ]
    ordering_fields = ["action_date", "created_at", "level"]
    ordering = ["-action_date"]

    def update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Les actions de recouvrement sont immuables."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Les actions de recouvrement ne peuvent pas être supprimées."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=["get"], url_path="overdue-invoices")
    def overdue_invoices(self, request):
        """
        Retourne toutes les factures en retard avec leur palier dunning courant,
        le solde dû, et les dernières actions enregistrées.
        GET /api/accounting/dunning/overdue-invoices/
        """
        qs = (
            Invoice.objects.filter(status=Invoice.Status.ISSUED)
            .select_related("patient", "treatment_plan")
            .prefetch_related(
                Prefetch(
                    "dunning_actions",
                    queryset=DunningAction.objects.order_by("-action_date"),
                )
            )
        )

        overdue = [inv for inv in qs if inv.days_overdue > 0]
        data = InvoiceSerializer(overdue, many=True, context={"request": request}).data
        return Response(data)


class InvoiceLineItemViewSet(viewsets.ModelViewSet):
    """Manage invoice line items.

    GET    /api/accounting/invoice-line-items/        - List all line items
    GET    /api/accounting/invoice-line-items/{id}/   - Get a line item
    POST   /api/accounting/invoice-line-items/        - Create a line item
    PATCH  /api/accounting/invoice-line-items/{id}/   - Update a line item
    DELETE /api/accounting/invoice-line-items/{id}/   - Delete a line item
    """
    queryset = InvoiceLineItem.objects.select_related("invoice").all()
    serializer_class = InvoiceLineItemSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["invoice"]
    search_fields = ["description"]
    ordering_fields = ["created_at", "line_total"]
