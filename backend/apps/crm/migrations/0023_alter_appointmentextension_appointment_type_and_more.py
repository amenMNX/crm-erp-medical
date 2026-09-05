# Generated manually — 2026-08-29
# Adds OperationBooking + OperationStaff and extends Room.bookings_allowed
# to include operation_room.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0022_alter_appointmentextension_appointment_type_and_more"),
        ("hr", "0008_employee_role"),  # Employee lives in hr
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── 1. OperationBooking ───────────────────────────────────────────────
        migrations.CreateModel(
            name="OperationBooking",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                # Room must be usage=operation_room (enforced in serializer)
                (
                    "room",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="operation_bookings",
                        to="crm.room",
                    ),
                ),
                # Primary patient (always required)
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="operation_bookings",
                        to="crm.patient",
                    ),
                ),
                # Donor patient — only set when with_donor=True
                (
                    "donor_patient",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="operation_bookings_as_donor",
                        to="crm.patient",
                    ),
                ),
                ("with_donor", models.BooleanField(default=False, help_text="Opération avec donneur")),
                ("start_datetime", models.DateTimeField()),
                ("end_datetime", models.DateTimeField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("confirmed", "Confirmée"),
                            ("pending", "En attente"),
                            ("cancelled", "Annulée"),
                            ("completed", "Terminée"),
                        ],
                        default="confirmed",
                        max_length=20,
                    ),
                ),
                ("operation_type", models.CharField(blank=True, max_length=200, help_text="Ex : Greffe rénale, Cholécystectomie")),
                ("notes", models.TextField(blank=True)),
                (
                    "booked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="operation_bookings_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Réservation de bloc opératoire",
                "verbose_name_plural": "Réservations de bloc opératoire",
                "ordering": ["start_datetime"],
            },
        ),
        # ── 2. OperationStaff (staff assigned to an operation) ────────────────
        migrations.CreateModel(
            name="OperationStaff",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "operation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="staff_assignments",
                        to="crm.operationbooking",
                    ),
                ),
                (
                    "employee",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="operation_assignments",
                        to="hr.employee",
                    ),
                ),
                # Role within this specific operation (may differ from job_title)
                (
                    "role",
                    models.CharField(
                        max_length=100,
                        help_text="Ex : Chirurgien principal, Anesthésiste, Infirmier(e) de bloc",
                    ),
                ),
            ],
            options={
                "verbose_name": "Personnel assigné",
                "verbose_name_plural": "Personnel assigné",
                "unique_together": {("operation", "employee")},
            },
        ),
    ]