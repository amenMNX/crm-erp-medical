from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from decimal import Decimal


def rename_legacy_skill_table(apps, schema_editor):
    """Move an old incompatible hr_skill table before creating the new model."""
    with schema_editor.connection.cursor() as cursor:
        table_names = schema_editor.connection.introspection.table_names(cursor)
        if "hr_skill" not in table_names:
            return

        description = schema_editor.connection.introspection.get_table_description(
            cursor,
            "hr_skill",
        )
        column_names = {column.name for column in description}
        new_skill_columns = {"name", "category", "description", "is_active", "created_at"}

        if new_skill_columns.issubset(column_names):
            return

        legacy_name = "hr_skill_legacy_before_0006"
        if legacy_name not in table_names:
            schema_editor.execute(f'ALTER TABLE "hr_skill" RENAME TO "{legacy_name}"')


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0005_shift"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(rename_legacy_skill_table, migrations.RunPython.noop),
        migrations.CreateModel(
            name="Skill",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150, unique=True)),
                ("category", models.CharField(
                    choices=[
                        ("clinical", "Clinique"),
                        ("technical", "Technique"),
                        ("regulatory", "Réglementaire / Sécurité"),
                        ("management", "Management"),
                        ("other", "Autre"),
                    ],
                    default="clinical",
                    max_length=30,
                )),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["category", "name"], "verbose_name": "Compétence", "verbose_name_plural": "Compétences"},
        ),
        migrations.CreateModel(
            name="TrainingSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True)),
                ("trainer", models.CharField(blank=True, help_text="Formateur interne ou organisme externe", max_length=200)),
                ("location", models.CharField(blank=True, max_length=200)),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("duration_hours", models.DecimalField(decimal_places=1, default=0, max_digits=6)),
                ("status", models.CharField(
                    choices=[
                        ("planned", "Planifiée"),
                        ("ongoing", "En cours"),
                        ("completed", "Terminée"),
                        ("cancelled", "Annulée"),
                    ],
                    default="planned",
                    max_length=20,
                )),
                ("max_participants", models.PositiveIntegerField(default=0, help_text="0 = illimité")),
                ("cost", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("skill", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="training_sessions",
                    to="hr.skill",
                    help_text="Compétence visée par cette formation",
                )),
                ("created_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="training_sessions_created",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-start_date"], "verbose_name": "Session de formation", "verbose_name_plural": "Sessions de formation"},
        ),
        migrations.CreateModel(
            name="EmployeeSkill",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("level", models.CharField(
                    choices=[
                        ("beginner", "Débutant"),
                        ("intermediate", "Intermédiaire"),
                        ("advanced", "Avancé"),
                        ("expert", "Expert"),
                    ],
                    default="intermediate",
                    max_length=20,
                )),
                ("acquired_date", models.DateField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="skills",
                    to="hr.employee",
                )),
                ("skill", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="employee_skills",
                    to="hr.skill",
                )),
            ],
            options={
                "ordering": ["skill__category", "skill__name"],
                "verbose_name": "Compétence employé",
                "verbose_name_plural": "Compétences employés",
            },
        ),
        migrations.CreateModel(
            name="TrainingEnrollment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("result", models.CharField(
                    choices=[
                        ("pending", "En attente"),
                        ("passed", "Réussi"),
                        ("failed", "Échoué"),
                        ("absent", "Absent"),
                    ],
                    default="pending",
                    max_length=20,
                )),
                ("score", models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True,
                                              help_text="Note obtenue (sur 100)")),
                ("certificate_issued", models.BooleanField(default=False)),
                ("notes", models.TextField(blank=True)),
                ("enrolled_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="enrollments",
                    to="hr.trainingsession",
                )),
                ("employee", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="training_enrollments",
                    to="hr.employee",
                )),
            ],
            options={
                "ordering": ["session__start_date", "employee__last_name"],
                "verbose_name": "Inscription à une formation",
                "verbose_name_plural": "Inscriptions aux formations",
            },
        ),
        migrations.AlterUniqueTogether(
            name="employeeskill",
            unique_together={("employee", "skill")},
        ),
        migrations.AlterUniqueTogether(
            name="trainingenrollment",
            unique_together={("session", "employee")},
        ),
    ]
