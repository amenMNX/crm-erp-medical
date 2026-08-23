from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0006_outgoingpayment"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DunningAction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("invoice", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="dunning_actions",
                    to="accounting.invoice",
                )),
                ("level", models.CharField(
                    choices=[
                        ("j30",      "Relance J+30"),
                        ("j60",      "Relance J+60"),
                        ("j90",      "Relance J+90"),
                        ("huissier", "Mise en demeure / huissier"),
                    ],
                    max_length=20,
                )),
                ("method", models.CharField(
                    choices=[
                        ("email",    "Email"),
                        ("courier",  "Courrier"),
                        ("phone",    "Téléphone"),
                        ("huissier", "Huissier"),
                    ],
                    default="email",
                    max_length=20,
                )),
                ("action_date", models.DateField(default=django.utils.timezone.now)),
                ("fee_amount", models.DecimalField(
                    decimal_places=2,
                    default="0.00",
                    help_text="Frais d'escalade appliqués (5% du solde dû au passage huissier)",
                    max_digits=10,
                )),
                ("notes", models.TextField(blank=True)),
                ("recorded_by", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="dunning_actions_recorded",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "verbose_name": "Action de recouvrement",
                "verbose_name_plural": "Actions de recouvrement",
                "ordering": ["-action_date", "-created_at"],
            },
        ),
    ]