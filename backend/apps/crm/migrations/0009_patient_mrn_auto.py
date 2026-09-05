"""
Migration 0009: Make medical_record_number auto-generated (blank=True).

Before: field was required (blank=False), callers had to supply it manually.
After:  field accepts blank — Patient.save() auto-generates MRN-YYYY-NNNN.
Existing rows with a non-blank MRN are unaffected.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0008_ticketcomment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="patient",
            name="medical_record_number",
            field=models.CharField(
                blank=True,
                max_length=50,
                unique=True,
                verbose_name="Medical Record Number",
                help_text="Auto-generated as MRN-YYYY-NNNN if left blank on creation.",
            ),
        ),
    ]