from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MedicalProductViewSet,
    StockAlertViewSet,
    StockEntryViewSet,
    StockMovementViewSet,
)

router = DefaultRouter()
router.register("products",  MedicalProductViewSet, basename="medical-product")
router.register("entries",   StockEntryViewSet,     basename="stock-entry")
router.register("movements", StockMovementViewSet,  basename="stock-movement")
router.register("alerts",    StockAlertViewSet,     basename="stock-alert")

urlpatterns = [
    path("", include(router.urls)),
]
