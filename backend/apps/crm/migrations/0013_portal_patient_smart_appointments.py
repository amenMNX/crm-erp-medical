from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0012_machine_room_alter_treatmentsession_machine_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── US-PAT-04 : Portail Patient ──────────────────────────────────────
        migrations.CreateModel(
            name="PatientPortalAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(unique=True)),
                ("password_hash", models.CharField(max_length=255)),
                ("is_active", models.BooleanField(default=True)),
                ("notify_email", models.BooleanField(default=True)),
                ("notify_sms", models.BooleanField(default=False)),
                ("last_login", models.DateTimeField(blank=True, null=True)),
                ("failed_login_attempts", models.PositiveSmallIntegerField(default=0)),
                ("locked_until", models.DateTimeField(blank=True, null=True)),
                ("reset_token", models.CharField(blank=True, max_length=64)),
                ("reset_token_expires", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("patient", models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="portal_account",
                    to="crm.patient",
                )),
            ],
            options={"verbose_name": "Compte Portail Patient", "verbose_name_plural": "Comptes Portail Patients"},
        ),
        migrations.CreateModel(
            name="PatientPortalSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=256)),
                ("account", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="sessions",
                    to="crm.patientportalaccount",
                )),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PortalMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("direction", models.CharField(choices=[("patient_to_staff","Patient → Staff"),("staff_to_patient","Staff → Patient")], max_length=20)),
                ("subject", models.CharField(blank=True, max_length=200)),
                ("content", models.TextField()),
                ("is_read", models.BooleanField(default=False)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="portal_messages", to="crm.patient")),
                ("staff_author", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="portal_messages_sent", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PatientRating",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("score", models.PositiveSmallIntegerField()),
                ("comment", models.TextField(blank=True)),
                ("is_anonymous", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ratings", to="crm.patient")),
                ("treatment_session", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="ratings", to="crm.treatmentsession")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PatientDocument",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("document_type", models.CharField(choices=[("compte_rendu","Compte-rendu"),("ordonnance","Ordonnance"),("imagerie","Imagerie"),("protocole","Protocole de traitement"),("facture","Facture"),("autre","Autre")], max_length=20)),
                ("title", models.CharField(max_length=200)),
                ("file_path", models.CharField(max_length=500)),
                ("file_size_kb", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="crm.patient")),
                ("uploaded_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="uploaded_documents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        # ── US-APT-02 : Rendez-vous Intelligents ─────────────────────────────
        migrations.CreateModel(
            name="DoctorAvailability",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("day_of_week", models.IntegerField(choices=[(0,"Lundi"),(1,"Mardi"),(2,"Mercredi"),(3,"Jeudi"),(4,"Vendredi"),(5,"Samedi")])),
                ("start_time", models.TimeField()),
                ("end_time", models.TimeField()),
                ("is_active", models.BooleanField(default=True)),
                ("doctor", models.ForeignKey(limit_choices_to={"profile__role":"doctor"}, on_delete=django.db.models.deletion.CASCADE, related_name="availabilities", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["day_of_week","start_time"], "verbose_name": "Disponibilité Médecin"},
        ),
        migrations.CreateModel(
            name="PatientSchedulingPreferences",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("preferred_time_slot", models.CharField(choices=[("morning","Matin (8h–12h)"),("afternoon","Après-midi (12h–17h)"),("any","Indifférent")], default="any", max_length=20)),
                ("preferred_days", models.JSONField(blank=True, default=list)),
                ("patient", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="scheduling_preferences", to="crm.patient")),
                ("preferred_doctor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="preferred_by_patients", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "Préférences de Planification"},
        ),
        migrations.CreateModel(
            name="AppointmentExtension",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("appointment_type", models.CharField(choices=[("simple","Consultation simple (15 min)"),("complex","Consultation complexe (30 min)"),("followup","Suivi de traitement (45 min)"),("urgency","Urgence")], default="simple", max_length=20)),
                ("duration_minutes", models.PositiveSmallIntegerField(default=15)),
                ("priority", models.IntegerField(choices=[(1,"Urgence (P1)"),(2,"Suivi (P2)"),(3,"Annuel (P3)")], default=2)),
                ("relevance_score", models.FloatField(blank=True, null=True)),
                ("confirmation_token", models.CharField(blank=True, max_length=64)),
                ("confirmation_deadline", models.DateTimeField(blank=True, null=True)),
                ("confirmed_at", models.DateTimeField(blank=True, null=True)),
                ("reminder_7d_sent", models.BooleanField(default=False)),
                ("reminder_3d_sent", models.BooleanField(default=False)),
                ("reminder_1d_sent", models.BooleanField(default=False)),
                ("appointment", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="extension", to="crm.appointment")),
                ("doctor", models.ForeignKey(blank=True, limit_choices_to={"profile__role": "doctor"}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointments_as_doctor", to=settings.AUTH_USER_MODEL)),
                ("room", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointments", to="crm.room")),
                ("machine", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="appointments", to="crm.machine")),
            ],
            options={"verbose_name": "Extension Rendez-vous"},
        ),
        migrations.CreateModel(
            name="SlotSuggestion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("suggestion_type", models.CharField(choices=[("closest","Le plus proche"),("best_match","Le plus adapté aux préférences"),("flexible","Le plus flexible")], max_length=20)),
                ("proposed_date", models.DateTimeField()),
                ("duration_minutes", models.PositiveSmallIntegerField(default=15)),
                ("relevance_score", models.FloatField(default=0.0)),
                ("is_accepted", models.BooleanField(default=False)),
                ("is_expired", models.BooleanField(default=False)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="slot_suggestions", to="crm.patient")),
                ("doctor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="slot_suggestions", to=settings.AUTH_USER_MODEL)),
                ("room", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="slot_suggestions", to="crm.room")),
                ("machine", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="slot_suggestions", to="crm.machine")),
                ("appointment", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="from_suggestions", to="crm.appointment")),
            ],
            options={"ordering": ["-relevance_score"]},
        ),
        migrations.CreateModel(
            name="WaitingList",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("appointment_type", models.CharField(default="simple", max_length=20)),
                ("priority", models.IntegerField(default=2)),
                ("earliest_date", models.DateField(blank=True, null=True)),
                ("latest_date", models.DateField(blank=True, null=True)),
                ("proposed_slot", models.DateTimeField(blank=True, null=True)),
                ("proposal_expires", models.DateTimeField(blank=True, null=True)),
                ("proposal_accepted", models.BooleanField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("patient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="waiting_list_entries", to="crm.patient")),
                ("doctor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="waiting_list", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["priority","created_at"], "verbose_name": "Liste d'attente"},
        ),
    ]
