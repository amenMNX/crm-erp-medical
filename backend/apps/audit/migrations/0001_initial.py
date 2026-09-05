# Hand-written (no Django available in this sandbox to run makemigrations) —
# mirrors the format Django itself generates, matching the AuditLogEntry
# model in apps/audit/models.py.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AuditLogEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("object_id", models.CharField(blank=True, max_length=64, null=True)),
                ("object_repr", models.CharField(blank=True, max_length=255)),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("create", "Création"),
                            ("update", "Modification"),
                            ("delete", "Suppression"),
                            ("login", "Connexion"),
                            ("login_failed", "Échec de connexion"),
                            ("logout", "Déconnexion"),
                        ],
                        max_length=20,
                    ),
                ),
                ("changes", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="audit_log_entries",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "content_type",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        to="contenttypes.contenttype",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="auditlogentry",
            index=models.Index(fields=["content_type", "object_id"], name="audit_audit_content_5c1e4a_idx"),
        ),
        migrations.AddIndex(
            model_name="auditlogentry",
            index=models.Index(fields=["created_at"], name="audit_audit_created_9b2f7d_idx"),
        ),
    ]
