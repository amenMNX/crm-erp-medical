from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CNAMClaimViewSet,
    DunningActionViewSet,
    InvoiceViewSet,
    OutgoingPaymentViewSet,
    PaymentViewSet,
    SubscriptionPlanViewSet,
    SubscriptionChangeViewSet,
    InvoiceLineItemViewSet,
    ChartOfAccountViewSet,
    JournalViewSet,
    JournalEntryViewSet,
    JournalLineViewSet,
)

router = DefaultRouter()
router.register("invoices",             InvoiceViewSet,           basename="invoice")
router.register("payments",             PaymentViewSet,           basename="payment")
router.register("invoice-line-items",   InvoiceLineItemViewSet,   basename="invoice-line-item")
router.register("outgoing-payments",    OutgoingPaymentViewSet,   basename="outgoing-payment")
router.register("cnam-claims",          CNAMClaimViewSet,         basename="cnam-claim")
router.register("subscription-plans",   SubscriptionPlanViewSet,  basename="subscription-plan")
router.register("subscription-changes", SubscriptionChangeViewSet,basename="subscription-change")
router.register("dunning",              DunningActionViewSet,     basename="dunning")
router.register("chart-of-accounts",    ChartOfAccountViewSet,    basename="chart-of-account")
router.register("journals",             JournalViewSet,           basename="journal")
router.register("journal-entries",      JournalEntryViewSet,      basename="journal-entry")
router.register("journal-lines",        JournalLineViewSet,       basename="journal-line")

urlpatterns = [
    path("", include(router.urls)),
]