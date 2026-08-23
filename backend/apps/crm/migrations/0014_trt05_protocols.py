from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0013_portal_patient_smart_appointments"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── 1. TreatmentProtocol ──────────────────────────────────────────────
        migrations.CreateModel(
            name="TreatmentProtocol",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveSmallIntegerField(default=1)),
                ("name", models.CharField(max_length=200)),
                ("icd10_code", models.CharField(blank=True, max_length=20)),
                ("icd10_label", models.CharField(blank=True, max_length=255)),
                ("cancer_type", models.CharField(blank=True, max_length=150)),
                ("international_reference", models.CharField(blank=True, max_length=255)),
                ("radiation_type", models.CharField(
                    choices=[
                        ("photon",        "Photons X"),
                        ("electron",      "Électrons"),
                        ("proton",        "Protons"),
                        ("neutron",       "Neutrons"),
                        ("brachytherapy", "Curiethérapie"),
                    ],
                    default="photon",
                    max_length=20,
                )),
                ("total_dose_gy", models.DecimalField(decimal_places=2, default=0, max_digits=7)),
                ("dose_per_fraction_gy", models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ("number_of_fractions", models.PositiveSmallIntegerField(default=0)),
                ("fraction_interval", models.CharField(
                    choices=[
                        ("daily",       "Quotidien (5j/semaine)"),
                        ("twice_daily", "2× par jour"),
                        ("weekly",      "Hebdomadaire"),
                        ("custom",      "Personnalisé"),
                    ],
                    default="daily",
                    max_length=20,
                )),
                ("total_duration_days", models.PositiveSmallIntegerField(default=0)),
                ("description", models.TextField(blank=True)),
                ("preparation_instructions", models.TextField(blank=True)),
                ("contraindications", models.TextField(blank=True)),
                ("status", models.CharField(
                    choices=[
                        ("draft",    "Brouillon"),
                        ("pending",  "En attente d'approbation"),
                        ("approved", "Approuvé"),
                        ("archived", "Archivé"),
                    ],
                    default="draft",
                    max_length=20,
                )),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("approved_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="protocols_approved",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="protocols_created",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("parent", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="children",
                    to="crm.treatmentprotocol",
                )),
            ],
            options={
                "verbose_name": "Protocole de traitement",
                "verbose_name_plural": "Protocoles de traitement",
                "ordering": ["-created_at"],
            },
        ),

        # ── 2. ProtocolChangeLog ──────────────────────────────────────────────
        migrations.CreateModel(
            name="ProtocolChangeLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=50)),
                ("changes", models.JSONField(blank=True, default=dict)),
                ("comment", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("performed_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="protocol_actions",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("protocol", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="changelog",
                    to="crm.treatmentprotocol",
                )),
            ],
            options={
                "verbose_name": "Journal protocole",
                "ordering": ["-created_at"],
            },
        ),

        # ── 3. DoseDeviation ─────────────────────────────────────────────────
        migrations.CreateModel(
            name="DoseDeviation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("expected_dose_gy", models.DecimalField(decimal_places=2, max_digits=6)),
                ("delivered_dose_gy", models.DecimalField(decimal_places=2, max_digits=6)),
                ("deviation_pct", models.DecimalField(decimal_places=2, max_digits=5)),
                ("severity", models.CharField(
                    choices=[
                        ("low",      "Faible (< 5%)"),
                        ("moderate", "Modéré (5–10%)"),
                        ("high",     "Élevé (> 10%)"),
                    ],
                    default="low",
                    max_length=20,
                )),
                ("notes", models.TextField(blank=True)),
                ("reviewed", models.BooleanField(default=False)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("protocol", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="deviations",
                    to="crm.treatmentprotocol",
                )),
                ("reviewed_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="deviations_reviewed",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("session", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="dose_deviation",
                    to="crm.treatmentsession",
                )),
            ],
            options={
                "verbose_name": "Écart de dose",
                "verbose_name_plural": "Écarts de dose",
                "ordering": ["-created_at"],
            },
        ),
    ]