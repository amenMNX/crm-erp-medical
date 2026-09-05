# Generated migration — Room.usage + Machine.room FK
# Apply after: 0018_room_capacity_room_room_type_alter_room_location_and_more

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0018_room_capacity_room_room_type_alter_room_location_and_more'),
    ]

    operations = [
        # ── Room: drop room_type, add usage + specialty ───────────────────────
        migrations.RemoveField(
            model_name='room',
            name='room_type',
        ),
        migrations.AddField(
            model_name='room',
            name='usage',
            field=models.CharField(
                choices=[
                    ('medicalized',         'Chambre médicalisée'),
                    ('patient_appointment', 'Salle de rendez-vous'),
                    ('stock',               'Stock / Local technique'),
                ],
                default='patient_appointment',
                help_text=(
                    'medicalized = chambre post-op/nuit ; '
                    'patient_appointment = consultation/radio/ophtalmo ; '
                    'stock = local matériel'
                ),
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='room',
            name='specialty',
            field=models.CharField(
                blank=True,
                help_text='Ex : Radiologie, Ophtalmologie, Consultation générale',
                max_length=100,
            ),
        ),
        migrations.AlterField(
            model_name='room',
            name='location',
            field=models.CharField(
                blank=True,
                help_text='Bâtiment / étage / aile',
                max_length=150,
            ),
        ),
        # ── Machine: add room FK ──────────────────────────────────────────────
        migrations.AddField(
            model_name='machine',
            name='room',
            field=models.ForeignKey(
                blank=True,
                help_text='Salle / local où se trouve la machine',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='machines',
                to='crm.room',
            ),
        ),
        migrations.AlterField(
            model_name='machine',
            name='location',
            field=models.CharField(
                blank=True,
                help_text="Complément d'adresse (étage, couloir…)",
                max_length=150,
            ),
        ),
    ]