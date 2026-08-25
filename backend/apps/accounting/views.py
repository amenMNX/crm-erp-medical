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
    # Must match the French name in RolePermission.write_permissions / frontend MODULES
    module_label = "Factures"


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
    permission_classes = [AccountingPermission]
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


# ── S8: General Ledger ViewSets ───────────────────────────────────────────────

from django.db.models import Sum as DSum
from .models import ChartOfAccount, Journal, JournalEntry, JournalLine
from .serializers import (
    ChartOfAccountSerializer, JournalSerializer,
    JournalEntrySerializer, JournalEntryCreateSerializer, JournalLineSerializer,
)


class ChartOfAccountViewSet(viewsets.ModelViewSet):
    serializer_class = ChartOfAccountSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["account_type", "is_analytical", "is_active"]
    search_fields = ["code", "name"]
    ordering_fields = ["code"]

    def get_queryset(self):
        return ChartOfAccount.objects.filter(is_active=True).select_related("parent")

    @action(detail=False, methods=["get"])
    def tree(self, request):
        def build(acct):
            return {
                "id": acct.id, "code": acct.code, "name": acct.name,
                "account_type": acct.account_type,
                "children": [build(c) for c in acct.children.filter(is_active=True)],
            }
        roots = ChartOfAccount.objects.filter(parent__isnull=True, is_active=True)
        return Response([build(r) for r in roots])


class JournalViewSet(viewsets.ModelViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["code", "name"]
    ordering_fields = ["code"]


class JournalEntryViewSet(viewsets.ModelViewSet):
    serializer_class = JournalEntrySerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["journal", "status", "entry_date"]
    search_fields = ["entry_number", "description", "reference"]
    ordering_fields = ["entry_date", "created_at"]

    def get_queryset(self):
        return JournalEntry.objects.select_related(
            "journal", "created_by", "validated_by"
        ).prefetch_related("lines__account").all()

    def get_serializer_class(self):
        if self.action == "create":
            return JournalEntryCreateSerializer
        return JournalEntrySerializer

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"], url_path="post-entry")
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        try:
            entry.post(request.user)
            return Response(JournalEntrySerializer(entry).data)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        entry = self.get_object()
        if entry.status == JournalEntry.Status.POSTED:
            return Response(
                {"detail": "Une écriture validée ne peut pas être annulée directement."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entry.cancel(request.user)
        return Response(JournalEntrySerializer(entry).data)

    @action(detail=False, methods=["get"], url_path="balance-sheet")
    def balance_sheet(self, request):
        end_date = request.query_params.get("end_date")
        if not end_date:
            return Response({"detail": "Paramètre end_date requis."}, status=400)
        accts = ChartOfAccount.objects.filter(account_type__in=["actif", "passif"], is_active=True)
        result = []
        for a in accts:
            lines = JournalLine.objects.filter(
                account=a, entry__entry_date__lte=end_date, entry__status=JournalEntry.Status.POSTED,
            )
            td = lines.aggregate(t=DSum("debit"))["t"]  or 0
            tc = lines.aggregate(t=DSum("credit"))["t"] or 0
            bal = td - tc
            if a.normal_balance == "credit":
                bal = -bal
            result.append({"code": a.code, "name": a.name, "account_type": a.account_type,
                           "debit": td, "credit": tc, "balance": bal})
        return Response(result)

    @action(detail=False, methods=["get"], url_path="income-statement")
    def income_statement(self, request):
        start = request.query_params.get("start_date")
        end   = request.query_params.get("end_date")
        if not start or not end:
            return Response({"detail": "Paramètres start_date et end_date requis."}, status=400)
        accts = ChartOfAccount.objects.filter(account_type__in=["charge", "produit"], is_active=True)
        result, total_charges, total_produits = [], 0, 0
        for a in accts:
            lines = JournalLine.objects.filter(
                account=a, entry__entry_date__gte=start, entry__entry_date__lte=end,
                entry__status=JournalEntry.Status.POSTED,
            )
            td = lines.aggregate(t=DSum("debit"))["t"]  or 0
            tc = lines.aggregate(t=DSum("credit"))["t"] or 0
            if a.account_type == "produit":
                bal = tc - td
                total_produits += float(bal)
            else:
                bal = td - tc
                total_charges += float(bal)
            result.append({"code": a.code, "name": a.name, "account_type": a.account_type,
                           "debit": td, "credit": tc, "balance": bal})
        return Response({
            "lines": result,
            "summary": {
                "total_charges": total_charges,
                "total_produits": total_produits,
                "result": total_produits - total_charges,
            },
        })


class JournalLineViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = JournalLineSerializer
    permission_classes = [AccountingPermission]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["account", "entry"]
    ordering_fields = ["id"]

    def get_queryset(self):
        return JournalLine.objects.select_related("account", "entry").all()