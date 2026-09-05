from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0006_skills_training"),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="leave_credit_days",
            field=models.DecimalField(
                decimal_places=1,
                default=30,
                help_text="Annual leave credit in days",
                max_digits=5,
            ),
        ),
    ]
