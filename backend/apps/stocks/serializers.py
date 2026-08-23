from rest_framework import serializers
from .models import MedicalProduct, StockAlert, StockEntry, StockMovement


class StockAlertSerializer(serializers.ModelSerializer):
    is_triggered = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockAlert
        fields = [
            "id", "product", "min_quantity", "reorder_quantity",
            "preferred_supplier", "lead_time_days", "is_active", "is_triggered",
        ]
        read_only_fields = ["id", "is_triggered"]


class MedicalProductSerializer(serializers.ModelSerializer):
    current_stock  = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    unit_label     = serializers.CharField(source="get_unit_display", read_only=True)
    alert          = StockAlertSerializer(read_only=True)

    class Meta:
        model = MedicalProduct
        fields = [
            "id", "reference", "name", "category", "category_label",
            "unit", "unit_label", "description", "manufacturer",
            "is_active", "current_stock", "alert",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "current_stock", "category_label", "unit_label", "alert", "created_at", "updated_at"]


class StockMovementSerializer(serializers.ModelSerializer):
    movement_type_label = serializers.CharField(source="get_movement_type_display", read_only=True)
    recorded_by_name    = serializers.SerializerMethodField()

    class Meta:
        model = StockMovement
        fields = [
            "id", "entry", "movement_type", "movement_type_label",
            "quantity", "movement_date", "reason", "reference", "notes",
            "recorded_by", "recorded_by_name", "created_at",
        ]
        read_only_fields = ["id", "movement_type_label", "recorded_by", "recorded_by_name", "created_at"]

    def get_recorded_by_name(self, obj):
        if not obj.recorded_by:
            return None
        return obj.recorded_by.get_full_name() or obj.recorded_by.username

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["recorded_by"] = request.user
        return super().create(validated_data)


class StockEntrySerializer(serializers.ModelSerializer):
    product_name      = serializers.CharField(source="product.name", read_only=True)
    product_reference = serializers.CharField(source="product.reference", read_only=True)
    product_unit      = serializers.CharField(source="product.get_unit_display", read_only=True)
    is_expired        = serializers.BooleanField(read_only=True)
    days_until_expiry = serializers.IntegerField(read_only=True)
    movements         = StockMovementSerializer(many=True, read_only=True)
    created_by_name   = serializers.SerializerMethodField()

    class Meta:
        model = StockEntry
        fields = [
            "id", "product", "product_name", "product_reference", "product_unit",
            "lot_number", "received_date", "expiry_date",
            "quantity_initial", "quantity_remaining",
            "unit_cost", "supplier", "purchase_order", "notes",
            "is_expired", "days_until_expiry",
            "movements", "created_by", "created_by_name", "created_at",
        ]
        read_only_fields = [
            "id", "product_name", "product_reference", "product_unit",
            "is_expired", "days_until_expiry", "movements",
            "created_by", "created_by_name", "created_at",
        ]

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username

    def create(self, validated_data):
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["created_by"] = request.user
        # On initialise quantity_remaining = quantity_initial
        if "quantity_remaining" not in validated_data:
            validated_data["quantity_remaining"] = validated_data.get("quantity_initial", 0)
        return super().create(validated_data)
