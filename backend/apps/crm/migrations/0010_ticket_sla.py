"""
Migration 0010: Add SLA fields to Ticket.

  sla_deadline  — DateTimeField, auto-set at creation (created_at + SLA hours)
  sla_breached  — BooleanField, set by the check_sla management command
  resolved_at   — DateTimeField, auto-set when statut = Résolu / Fermé

Existing tickets get sla_deadline=None and sla_breached=False.
Run `python manage.py check_sla` after deploying to backfill sla_deadline
for existing open tickets.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0009_patient_mrn_auto"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="sla_deadline",
            field=models.DateTimeField(
                blank=True, null=True,
                help_text="Auto-set at creation: created_at + SLA hours for this priority.",
            ),
        ),
        migrations.AddField(
            model_name="ticket",
            name="sla_breached",
            field=models.BooleanField(
                default=False,
                help_text="Set by the SLA engine when the resolution deadline is missed.",
            ),
        ),
        migrations.AddField(
            model_name="ticket",
            name="resolved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="ticket",
            index=models.Index(
                fields=["sla_deadline", "sla_breached"],
                name="ticket_sla_idx",
            ),
        ),
    ]