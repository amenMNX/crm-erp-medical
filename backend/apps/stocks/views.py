from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyOrRole
from .models import MedicalProduct, StockAlert, StockEntry, StockMovement
from .serializers import (
    MedicalProductSerializer,
    StockAlertSerializer,
    StockEntrySerializer,
    StockMovementSerializer,
)


class StocksPermission(ReadOnlyOrRole):
    allowed_roles = ["admin", "pharmacist", "nurse", "doctor"]


class MedicalProductViewSet(viewsets.ModelViewSet):
    """
    Catalogue des produits médicaux.

    GET  /api/stocks/products/             — liste tous les produits
    GET  /api/stocks/products/low_stock/   — produits sous le seuil d'alerte
    POST /api/stocks/products/             — créer un produit
    """

    queryset = MedicalProduct.objects.prefetch_related("entries", "alert").all()
    serializer_class = MedicalProductSerializer
    permission_classes = [StocksPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["reference", "name", "manufacturer", "description"]
    ordering_fields = ["name", "reference", "created_at"]
    ordering = ["name"]

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        """Produits dont le stock actuel est en dessous du seuil d'alerte."""
        products = [
            p for p in self.get_queryset()
            if hasattr(p, "alert") and p.alert and p.alert.is_triggered
        ]
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="dashboard-summary")
    def dashboard_summary(self, request):
        """Résumé pour le widget du dashboard stocks."""
        today = timezone.now().date()
        soon = today + timezone.timedelta(days=30)

        products_qs = MedicalProduct.objects.prefetch_related("entries", "alert").filter(is_active=True)
        total_products = products_qs.count()

        low_stock_count = sum(
            1 for p in products_qs
            if hasattr(p, "alert") and p.alert and p.alert.is_triggered
        )

        expiring_soon = StockEntry.objects.filter(
            expiry_date__gte=today,
            expiry_date__lte=soon,
            quantity_remaining__gt=0,
        ).count()

        expired = StockEntry.objects.filter(
            expiry_date__lt=today,
            quantity_remaining__gt=0,
        ).count()

        return Response({
            "total_active_products": total_products,
            "low_stock_alerts": low_stock_count,
            "expiring_soon_lots": expiring_soon,
            "expired_lots_with_stock": expired,
        })


class StockEntryViewSet(viewsets.ModelViewSet):
    """
    Lots reçus.

    GET  /api/stocks/entries/                   — liste
    GET  /api/stocks/entries/?product=<id>      — lots d'un produit
    GET  /api/stocks/entries/expiring_soon/     — lots qui expirent dans 30 j
    POST /api/stocks/entries/                   — enregistrer une réception
    """

    queryset = (
        StockEntry.objects.select_related("product", "created_by")
        .prefetch_related("movements")
        .all()
    )
    serializer_class = StockEntrySerializer
    permission_classes = [StocksPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["product", "supplier"]
    search_fields = ["lot_number", "supplier", "purchase_order", "product__name", "product__reference"]
    ordering_fields = ["received_date", "expiry_date", "created_at"]
    ordering = ["-received_date"]

    @action(detail=False, methods=["get"], url_path="expiring-soon")
    def expiring_soon(self, request):
        """Lots qui expirent dans les 30 prochains jours et ont encore du stock."""
        today = timezone.now().date()
        soon = today + timezone.timedelta(days=30)
        qs = self.get_queryset().filter(
            expiry_date__gte=today,
            expiry_date__lte=soon,
            quantity_remaining__gt=0,
        ).order_by("expiry_date")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="expired")
    def expired(self, request):
        """Lots périmés ayant encore du stock résiduel (à mettre au rebut)."""
        today = timezone.now().date()
        qs = self.get_queryset().filter(
            expiry_date__lt=today,
            quantity_remaining__gt=0,
        ).order_by("expiry_date")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class StockMovementViewSet(viewsets.ModelViewSet):
    """
    Journal des mouvements (append-only).

    GET  /api/stocks/movements/             — tous les mouvements
    GET  /api/stocks/movements/?entry=<id>  — mouvements d'un lot
    POST /api/stocks/movements/             — enregistrer un mouvement
    PUT/PATCH/DELETE désactivés.
    """

    queryset = StockMovement.objects.select_related("entry__product", "recorded_by").all()
    serializer_class = StockMovementSerializer
    permission_classes = [StocksPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["entry", "movement_type", "entry__product"]
    search_fields = ["reason", "reference", "notes", "entry__product__name"]
    ordering_fields = ["movement_date", "created_at"]
    ordering = ["-movement_date"]

    def update(self, request, *args, **kwargs):
        return Response(
            {"detail": "Les mouvements de stock sont immuables."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Les mouvements de stock ne peuvent pas être supprimés."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class StockAlertViewSet(viewsets.ModelViewSet):
    """
    Seuils d'alerte par produit.

    GET  /api/stocks/alerts/            — liste des alertes
    GET  /api/stocks/alerts/triggered/  — alertes déclenchées actuellement
    POST /api/stocks/alerts/            — créer une alerte
    """

    queryset = StockAlert.objects.select_related("product").all()
    serializer_class = StockAlertSerializer
    permission_classes = [StocksPermission]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["product", "is_active"]
    search_fields = ["product__name", "product__reference", "preferred_supplier"]

    @action(detail=False, methods=["get"], url_path="triggered")
    def triggered(self, request):
        """Alertes actuellement déclenchées (stock ≤ seuil)."""
        triggered = [a for a in self.get_queryset() if a.is_triggered]
        serializer = self.get_serializer(triggered, many=True)
        return Response(serializer.data)
