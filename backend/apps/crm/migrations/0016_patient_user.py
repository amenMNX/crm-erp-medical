# apps/crm/migrations/0016_patient_user.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0015_machine_calibration_interval_days_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="user",
            field=models.OneToOneField(
                blank=True,
                help_text="Linked Django user account — lets the patient log in to the system.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="patient_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]