from django.contrib import admin
from .models import MedicalProduct, StockAlert, StockEntry, StockMovement


class StockAlertInline(admin.StackedInline):
    model = StockAlert
    extra = 0


class StockEntryInline(admin.TabularInline):
    model = StockEntry
    extra = 0
    fields = ["lot_number", "received_date", "expiry_date", "quantity_initial", "quantity_remaining", "supplier"]
    readonly_fields = ["quantity_remaining"]


@admin.register(MedicalProduct)
class MedicalProductAdmin(admin.ModelAdmin):
    list_display = ["reference", "name", "category", "unit", "current_stock", "is_active"]
    list_filter  = ["category", "is_active"]
    search_fields = ["reference", "name", "manufacturer"]
    inlines = [StockAlertInline, StockEntryInline]
    readonly_fields = ["current_stock", "created_at", "updated_at"]

    def current_stock(self, obj):
        return obj.current_stock
    current_stock.short_description = "Stock actuel"


@admin.register(StockEntry)
class StockEntryAdmin(admin.ModelAdmin):
    list_display = ["product", "lot_number", "received_date", "expiry_date", "quantity_remaining", "supplier"]
    list_filter  = ["product__category", "supplier"]
    search_fields = ["lot_number", "supplier", "purchase_order", "product__name"]
    readonly_fields = ["created_at", "created_by"]


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ["entry", "movement_type", "quantity", "movement_date", "recorded_by"]
    list_filter  = ["movement_type"]
    search_fields = ["reason", "reference", "entry__product__name"]
    readonly_fields = ["created_at", "recorded_by"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockAlert)
class StockAlertAdmin(admin.ModelAdmin):
    list_display = ["product", "min_quantity", "reorder_quantity", "is_active", "is_triggered"]
    list_filter  = ["is_active"]
    search_fields = ["product__name", "preferred_supplier"]

    def is_triggered(self, obj):
        return obj.is_triggered
    is_triggered.boolean = True
    is_triggered.short_description = "Alerte active"
