from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MedicalProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(help_text="Référence interne (SKU)", max_length=60, unique=True)),
                ("name", models.CharField(max_length=200)),
                ("category", models.CharField(
                    choices=[
                        ("medication", "Médicament"),
                        ("consumable", "Consommable"),
                        ("radioactive", "Source radioactive / dosimétrie"),
                        ("protective", "Équipement de protection"),
                        ("other", "Autre"),
                    ],
                    default="consumable",
                    max_length=30,
                )),
                ("unit", models.CharField(
                    choices=[
                        ("pcs", "Pièce"),
                        ("box", "Boîte"),
                        ("vial", "Flacon"),
                        ("mg", "mg"),
                        ("ml", "ml"),
                        ("Gy", "Gray (Gy)"),
                    ],
                    default="pcs",
                    max_length=10,
                )),
                ("description", models.TextField(blank=True)),
                ("manufacturer", models.CharField(blank=True, max_length=150)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["name"], "verbose_name": "Produit médical", "verbose_name_plural": "Produits médicaux"},
        ),
        migrations.CreateModel(
            name="StockAlert",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("min_quantity", models.DecimalField(decimal_places=2, default=Decimal("0"), max_digits=12)),
                ("reorder_quantity", models.DecimalField(
                    decimal_places=2, default=Decimal("0"),
                    help_text="Quantité à commander lors d'un réapprovisionnement",
                    max_digits=12,
                )),
                ("preferred_supplier", models.CharField(blank=True, max_length=200)),
                ("lead_time_days", models.PositiveIntegerField(default=0, help_text="Délai fournisseur en jours")),
                ("is_active", models.BooleanField(default=True)),
                ("product", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="alert",
                    to="stocks.medicalproduct",
                )),
            ],
            options={"verbose_name": "Alerte stock", "verbose_name_plural": "Alertes stock"},
        ),
        migrations.CreateModel(
            name="StockEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("lot_number", models.CharField(blank=True, help_text="N° de lot fournisseur", max_length=100)),
                ("received_date", models.DateField(default=django.utils.timezone.now)),
                ("expiry_date", models.DateField(blank=True, null=True)),
                ("quantity_initial", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quantity_remaining", models.DecimalField(decimal_places=2, max_digits=12)),
                ("unit_cost", models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
                ("supplier", models.CharField(blank=True, max_length=200)),
                ("purchase_order", models.CharField(blank=True, help_text="N° bon de commande", max_length=100)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("product", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="entries",
                    to="stocks.medicalproduct",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="stock_entries_created",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-received_date", "-created_at"], "verbose_name": "Entrée de stock", "verbose_name_plural": "Entrées de stock"},
        ),
        migrations.CreateModel(
            name="StockMovement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("movement_type", models.CharField(
                    choices=[
                        ("in", "Entrée (réception)"),
                        ("out", "Sortie (utilisation)"),
                        ("adjustment", "Ajustement (inventaire)"),
                        ("expired", "Mise au rebut (périmé)"),
                        ("return", "Retour fournisseur"),
                    ],
                    max_length=20,
                )),
                ("quantity", models.DecimalField(
                    decimal_places=2,
                    help_text="Positif = entrée, négatif = sortie",
                    max_digits=12,
                )),
                ("movement_date", models.DateField(default=django.utils.timezone.now)),
                ("reason", models.CharField(blank=True, max_length=255)),
                ("reference", models.CharField(blank=True, help_text="N° bon, facture, patient…", max_length=100)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("entry", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="movements",
                    to="stocks.stockentry",
                )),
                ("recorded_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="stock_movements_recorded",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-movement_date", "-created_at"], "verbose_name": "Mouvement de stock", "verbose_name_plural": "Mouvements de stock"},
        ),
        migrations.AddIndex(
            model_name="medicalproduct",
            index=models.Index(fields=["category", "is_active"], name="stocks_medi_categor_idx"),
        ),
        migrations.AddIndex(
            model_name="stockentry",
            index=models.Index(fields=["product", "expiry_date"], name="stocks_stoc_product_exp_idx"),
        ),
    ]
