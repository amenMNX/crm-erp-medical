from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0008_alter_dunningaction_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="patient_share",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0.00"),
                max_digits=10,
                help_text="Part payée par le patient (ticket modérateur). 0 si sans couverture CNAM.",
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="cnam_share",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0.00"),
                max_digits=10,
                help_text="Part prise en charge directement par la CNAM.",
            ),
        ),
        migrations.AddField(
            model_name="invoice",
            name="is_apci",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Affection Prise en Charge Intégralement (ALD). "
                    "Si True : prise en charge à 100 % par la CNAM, pas de ticket modérateur, "
                    "hors plafond annuel."
                ),
            ),
        ),
        migrations.AddIndex(
            model_name="invoice",
            index=models.Index(fields=["is_apci"], name="accounting_invoice_apci_idx"),
        ),
    ]