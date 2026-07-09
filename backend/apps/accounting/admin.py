from django.contrib import admin

from .models import Invoice, Payment


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "patient",
        "issue_date",
        "due_date",
        "status",
        "total_amount",
    )
    search_fields = (
        "invoice_number",
        "patient__first_name",
        "patient__last_name",
        "patient__medical_record_number",
    )
    list_filter = ("status", "issue_date", "due_date")

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_number",
        "invoice",
        "payment_date",
        "amount",
        "method",
        "reference",
    )
    search_fields = (
        "payment_number",
        "invoice__invoice_number",
        "reference",
    )
    list_filter = ("method", "payment_date")