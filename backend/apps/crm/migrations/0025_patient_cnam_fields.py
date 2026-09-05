from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0024_alter_appointmentextension_appointment_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="cnam_scheme",
            field=models.CharField(
                choices=[
                    ("none", "Sans couverture CNAM"),
                    ("public", "Filière publique (CNSS/hôpital)"),
                    ("remboursement", "Filière remboursement"),
                    ("tiers_payant", "Tiers payant (médecin traitant)"),
                ],
                default="none",
                max_length=20,
                help_text="Filière CNAM choisie par l'assuré lors de son affiliation.",
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="cnam_affiliation_number",
            field=models.CharField(
                blank=True,
                max_length=50,
                help_text="Numéro d'affiliation CNAM (CNSS ou CNRPS).",
            ),
        ),
    ]