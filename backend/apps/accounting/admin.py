from django.contrib import admin

from .models import Invoice, InvoiceLineItem, Payment , OutgoingPayment 

class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 1
    readonly_fields = ("line_subtotal", "line_tax", "line_total", "created_at")

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
    inlines = [InvoiceLineItemInline]

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

@admin.register(OutgoingPayment)
class OutgoingPaymentAdmin(admin.ModelAdmin):
    list_display  = ("reference", "category", "amount", "payment_date", "method", "created_at")
    list_filter   = ("category", "method", "payment_date")
    search_fields = ("reference", "description")
    readonly_fields = ("reference", "created_at", "updated_at")