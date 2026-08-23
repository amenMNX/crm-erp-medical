"""
US-STK-02 — Gestion avancée des stocks médicaux
================================================
Modèles :
  - MedicalProduct  : catalogue des produits (médicaments, consommables, matériaux)
  - StockEntry      : lots reçus (N° lot, date expiration, quantité initiale)
  - StockMovement   : chaque entrée/sortie/ajustement sur un lot (immuable)
  - StockAlert      : seuil d'alerte et paramètres de réapprovisionnement
"""

from decimal import Decimal
from django.db import models
from django.utils import timezone


class MedicalProduct(models.Model):
    """Produit du catalogue : médicament, consommable ou matériau de radiothérapie."""

    class Category(models.TextChoices):
        MEDICATION    = "medication",    "Médicament"
        CONSUMABLE    = "consumable",    "Consommable"
        RADIOACTIVE   = "radioactive",   "Source radioactive / dosimétrie"
        PROTECTIVE    = "protective",    "Équipement de protection"
        OTHER         = "other",         "Autre"

    class Unit(models.TextChoices):
        PIECE   = "pcs",  "Pièce"
        BOX     = "box",  "Boîte"
        VIAL    = "vial", "Flacon"
        MG      = "mg",   "mg"
        ML      = "ml",   "ml"
        GY      = "Gy",   "Gray (Gy)"

    reference      = models.CharField(max_length=60, unique=True, help_text="Référence interne (SKU)")
    name           = models.CharField(max_length=200)
    category       = models.CharField(max_length=30, choices=Category.choices, default=Category.CONSUMABLE)
    unit           = models.CharField(max_length=10, choices=Unit.choices, default=Unit.PIECE)
    description    = models.TextField(blank=True)
    manufacturer   = models.CharField(max_length=150, blank=True)
    is_active      = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Produit médical"
        verbose_name_plural = "Produits médicaux"
        indexes = [
            models.Index(fields=["category", "is_active"]),
        ]

    def __str__(self):
        return f"{self.reference} — {self.name}"

    @property
    def current_stock(self):
        """Quantité totale disponible (tous lots non expirés)."""
        from django.db.models import Sum
        today = timezone.now().date()
        return (
            self.entries.filter(
                models.Q(expiry_date__isnull=True) | models.Q(expiry_date__gte=today)
            )
            .aggregate(total=Sum("quantity_remaining"))["total"]
            or 0
        )


class StockAlert(models.Model):
    """Seuils de réapprovisionnement par produit."""

    product              = models.OneToOneField(MedicalProduct, on_delete=models.CASCADE, related_name="alert")
    min_quantity         = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    reorder_quantity     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"),
                                               help_text="Quantité à commander lors d'un réapprovisionnement")
    preferred_supplier   = models.CharField(max_length=200, blank=True)
    lead_time_days       = models.PositiveIntegerField(default=0, help_text="Délai fournisseur en jours")
    is_active            = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Alerte stock"
        verbose_name_plural = "Alertes stock"

    def __str__(self):
        return f"Alerte — {self.product.name} (seuil: {self.min_quantity})"

    @property
    def is_triggered(self):
        return self.is_active and self.product.current_stock <= self.min_quantity


class StockEntry(models.Model):
    """
    Lot reçu d'un produit (chaque livraison = un StockEntry).
    Les mouvements de sortie/ajustement décrément quantity_remaining.
    """

    product          = models.ForeignKey(MedicalProduct, on_delete=models.CASCADE, related_name="entries")
    lot_number       = models.CharField(max_length=100, blank=True, help_text="N° de lot fournisseur")
    received_date    = models.DateField(default=timezone.now)
    expiry_date      = models.DateField(null=True, blank=True)
    quantity_initial = models.DecimalField(max_digits=12, decimal_places=2)
    quantity_remaining = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost        = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"))
    supplier         = models.CharField(max_length=200, blank=True)
    purchase_order   = models.CharField(max_length=100, blank=True, help_text="N° bon de commande")
    notes            = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="stock_entries_created")

    class Meta:
        ordering = ["-received_date", "-created_at"]
        verbose_name = "Entrée de stock"
        verbose_name_plural = "Entrées de stock"
        indexes = [
            models.Index(fields=["product", "expiry_date"]),
        ]

    def __str__(self):
        return f"{self.product.reference} — lot {self.lot_number or 'N/A'} ({self.quantity_remaining}/{self.quantity_initial})"

    @property
    def is_expired(self):
        if not self.expiry_date:
            return False
        return self.expiry_date < timezone.now().date()

    @property
    def days_until_expiry(self):
        if not self.expiry_date:
            return None
        delta = (self.expiry_date - timezone.now().date()).days
        return delta


class StockMovement(models.Model):
    """
    Journal immuable de chaque mouvement sur un lot (sortie, retour, ajustement).
    Chaque ligne est append-only — pas de modification.
    """

    class MovementType(models.TextChoices):
        IN         = "in",         "Entrée (réception)"
        OUT        = "out",        "Sortie (utilisation)"
        ADJUSTMENT = "adjustment", "Ajustement (inventaire)"
        EXPIRED    = "expired",    "Mise au rebut (périmé)"
        RETURN     = "return",     "Retour fournisseur"

    entry         = models.ForeignKey(StockEntry, on_delete=models.CASCADE, related_name="movements")
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity      = models.DecimalField(max_digits=12, decimal_places=2,
                                        help_text="Positif = entrée, négatif = sortie")
    movement_date = models.DateField(default=timezone.now)
    reason        = models.CharField(max_length=255, blank=True)
    reference     = models.CharField(max_length=100, blank=True, help_text="N° bon, facture, patient…")
    notes         = models.TextField(blank=True)
    recorded_by   = models.ForeignKey("auth.User", on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name="stock_movements_recorded")
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-movement_date", "-created_at"]
        verbose_name = "Mouvement de stock"
        verbose_name_plural = "Mouvements de stock"

    def __str__(self):
        sign = "+" if self.quantity >= 0 else ""
        return f"{self.get_movement_type_display()} {sign}{self.quantity} — {self.entry.product.reference}"

    def save(self, *args, **kwargs):
        """Met à jour quantity_remaining du lot lors de la création du mouvement."""
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            # Recalcule le restant du lot
            from django.db.models import Sum as _Sum
            total = (
                self.entry.movements.aggregate(total=_Sum("quantity"))["total"] or Decimal("0")
            )
            StockEntry.objects.filter(pk=self.entry_id).update(
                quantity_remaining=self.entry.quantity_initial + total
            )
