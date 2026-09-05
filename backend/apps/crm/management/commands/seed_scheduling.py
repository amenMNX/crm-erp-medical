"""
Management command: seed_scheduling
====================================
Creates a complete, self-consistent dataset to test the patient portal
appointment booking flow end-to-end.

What it seeds
─────────────
Doctors (3)  — each with a realistic weekly DoctorAvailability schedule
Patients (4) — each with a PatientPortalAccount (password = "test1234")
Appointments — a few already-booked slots so the "slot free?" logic is exercised
Preferences  — one patient has preferred doctor / time-slot preferences

Usage
─────
  python manage.py seed_scheduling            # add data idempotently
  python manage.py seed_scheduling --reset    # wipe seed data first, then re-seed
  python manage.py seed_scheduling --verify   # print a summary without touching the DB

Portal login credentials (all patients)
────────────────────────────────────────
  last_name + cin + medical_record_number  (printed at the end)
  password: test1234
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

User = get_user_model()

# ── Sentinel prefix used to identify seed data ─────────────────────────────
SEED_TAG = "SEED-SCHED"


# ── Doctor schedules  ───────────────────────────────────────────────────────
# Each entry: (username, first, last, specialty, schedule)
# schedule = list of (day_of_week 0=Mon…5=Sat, start_time, end_time)
DOCTOR_SPECS = [
    (
        "dr_benali",
        "Sami",
        "Ben Ali",
        "Radiothérapie",
        [
            (0, time(8, 0),  time(12, 0)),   # Lundi matin
            (0, time(13, 0), time(17, 0)),   # Lundi après-midi
            (2, time(8, 0),  time(12, 0)),   # Mercredi matin
            (3, time(9, 0),  time(16, 0)),   # Jeudi
            (4, time(8, 0),  time(11, 0)),   # Vendredi matin seulement
        ],
    ),
    (
        "dr_kasmi",
        "Leila",
        "Kasmi",
        "Oncologie",
        [
            (1, time(8, 0),  time(12, 30)),  # Mardi matin
            (1, time(14, 0), time(17, 30)),  # Mardi après-midi
            (3, time(8, 0),  time(12, 0)),   # Jeudi matin
            (4, time(10, 0), time(15, 0)),   # Vendredi
        ],
    ),
    (
        "dr_maaroufi",
        "Karim",
        "Maaroufi",
        "Médecine Générale",
        [
            (0, time(8, 0),  time(12, 0)),   # Lundi matin
            (1, time(8, 0),  time(12, 0)),   # Mardi matin
            (2, time(13, 0), time(17, 0)),   # Mercredi après-midi
            (3, time(8, 0),  time(12, 0)),   # Jeudi matin
            (4, time(8, 0),  time(12, 0)),   # Vendredi matin
            (5, time(9, 0),  time(12, 0)),   # Samedi matin
        ],
    ),
]

# ── Patient specs ────────────────────────────────────────────────────────────
PATIENT_SPECS = [
    {
        "first_name": "Yasmine",
        "last_name":  "Trabelsi",
        "cin":        f"{SEED_TAG}-CIN-001",
        "mrn":        f"{SEED_TAG}-MRN-001",
        "phone":      "22000001",
        "email":      "yasmine.trabelsi@test.local",
        "birth_date": date(1990, 3, 15),
        "diagnosis":  "Suivi oncologique",
    },
    {
        "first_name": "Mohamed",
        "last_name":  "Chaabane",
        "cin":        f"{SEED_TAG}-CIN-002",
        "mrn":        f"{SEED_TAG}-MRN-002",
        "phone":      "22000002",
        "email":      "med.chaabane@test.local",
        "birth_date": date(1978, 11, 20),
        "diagnosis":  "Radiothérapie palliative",
    },
    {
        "first_name": "Nour",
        "last_name":  "Mejri",
        "cin":        f"{SEED_TAG}-CIN-003",
        "mrn":        f"{SEED_TAG}-MRN-003",
        "phone":      "22000003",
        "email":      "nour.mejri@test.local",
        "birth_date": date(2001, 7, 4),
        "diagnosis":  "Consultation simple",
    },
    {
        "first_name": "Farida",
        "last_name":  "Bouhamed",
        "cin":        f"{SEED_TAG}-CIN-004",
        "mrn":        f"{SEED_TAG}-MRN-004",
        "phone":      "22000004",
        "email":      "farida.bouhamed@test.local",
        "birth_date": date(1965, 5, 28),
        "diagnosis":  "Suivi annuel",
    },
]

PORTAL_PASSWORD = "test1234"


class Command(BaseCommand):
    help = "Seed doctors + availabilities + patients for appointment booking tests."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete all existing seed data before re-seeding.",
        )
        parser.add_argument(
            "--verify",
            action="store_true",
            help="Print a summary of seed data without modifying the DB.",
        )

    # ─────────────────────────────────────────────────────────────────────────
    def handle(self, *args, **options):
        from apps.crm.models import (
            Appointment,
            AppointmentExtension,
            DoctorAvailability,
            Patient,
            PatientPortalAccount,
            PatientSchedulingPreferences,
        )
        from apps.accounts.models import UserProfile, Department

        if options["verify"]:
            self._verify()
            return

        if options["reset"]:
            self._reset()

        self.stdout.write(self.style.MIGRATE_HEADING("\n── Seeding scheduling test data ──\n"))

        # ── 1. Department ────────────────────────────────────────────────────
        dept_radio, _ = Department.objects.get_or_create(
            name="Radiothérapie",
            defaults={"description": "Service de radiothérapie", "is_active": True},
        )
        dept_onco, _ = Department.objects.get_or_create(
            name="Oncologie",
            defaults={"description": "Service d'oncologie", "is_active": True},
        )
        dept_gen, _ = Department.objects.get_or_create(
            name="Médecine Générale",
            defaults={"description": "Consultations générales", "is_active": True},
        )
        dept_map = {
            "Radiothérapie": dept_radio,
            "Oncologie": dept_onco,
            "Médecine Générale": dept_gen,
        }
        self.stdout.write("  ✔ Departments ready")

        # ── 2. Doctors + profiles + availability ─────────────────────────────
        doctors = {}
        for username, first, last, specialty, schedule in DOCTOR_SPECS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": first,
                    "last_name":  last,
                    "email":      f"{username}@clinic.local",
                    "is_active":  True,
                },
            )
            if created:
                user.set_password("docpass123")
                user.save()

            # Ensure profile exists with role=doctor
            profile, _ = UserProfile.objects.get_or_create(
                user=user,
                defaults={
                    "role": UserProfile.Role.DOCTOR,
                    "department": dept_map[specialty],
                    "department_old": specialty,
                },
            )
            if profile.role != UserProfile.Role.DOCTOR:
                profile.role = UserProfile.Role.DOCTOR
                profile.department = dept_map[specialty]
                profile.department_old = specialty
                profile.save()

            # Wipe and recreate availability so it's always clean
            DoctorAvailability.objects.filter(doctor=user).delete()
            for day, start, end in schedule:
                DoctorAvailability.objects.create(
                    doctor=user,
                    day_of_week=day,
                    start_time=start,
                    end_time=end,
                    is_active=True,
                )

            doctors[username] = user
            status_label = "created" if created else "updated"
            self.stdout.write(
                f"  ✔ Dr. {first} {last} ({status_label}) — "
                f"{len(schedule)} availability block(s)"
            )

        # ── 3. Patients + portal accounts ────────────────────────────────────
        patients = {}
        for spec in PATIENT_SPECS:
            patient, created = Patient.objects.get_or_create(
                medical_record_number=spec["mrn"],
                defaults={
                    "first_name": spec["first_name"],
                    "last_name":  spec["last_name"],
                    "cin":        spec["cin"],
                    "phone":      spec["phone"],
                    "email":      spec["email"],
                    "birth_date": spec["birth_date"],
                    "diagnosis":  spec["diagnosis"],
                },
            )

            # Portal account
            portal_account, pa_created = PatientPortalAccount.objects.get_or_create(
                patient=patient,
                defaults={
                    "email":     spec["email"],
                    "is_active": True,
                },
            )
            portal_account.set_password(PORTAL_PASSWORD)
            portal_account.email = spec["email"]
            portal_account.is_active = True
            portal_account.save()

            patients[spec["last_name"]] = patient
            status_label = "created" if created else "updated"
            self.stdout.write(
                f"  ✔ Patient {spec['first_name']} {spec['last_name']} "
                f"({status_label}) — portal account {'created' if pa_created else 'updated'}"
            )

        # ── 4. Patient scheduling preferences (one example) ──────────────────
        yasmine = patients["Trabelsi"]
        PatientSchedulingPreferences.objects.update_or_create(
            patient=yasmine,
            defaults={
                "preferred_time_slot": "morning",
                "preferred_days": [0, 2, 3],          # Lun, Mer, Jeu
                "preferred_doctor": doctors["dr_benali"],
            },
        )
        self.stdout.write("  ✔ Scheduling preferences set for Yasmine Trabelsi (morning, Mon/Wed/Thu, Dr Ben Ali)")

        # ── 5. Pre-booked appointments (to test conflict detection) ───────────
        # We'll book a slot in the first working week forward from today.
        self._seed_prebooked_appointments(doctors, patients)

        # ── 6. Print login credentials ───────────────────────────────────────
        self.stdout.write(self.style.SUCCESS("\n── Seed complete! ──\n"))
        self.stdout.write("Portal login credentials  (URL: /patient-portal)")
        self.stdout.write(f"  Password for all: {PORTAL_PASSWORD}\n")
        self.stdout.write(
            f"  {'Last name':<20} {'CIN':<26} {'MRN':<26}"
        )
        self.stdout.write("  " + "─" * 75)
        for spec in PATIENT_SPECS:
            self.stdout.write(
                f"  {spec['last_name']:<20} {spec['cin']:<26} {spec['mrn']:<26}"
            )

        self.stdout.write("\nDoctor availability summary:")
        for username, first, last, specialty, schedule in DOCTOR_SPECS:
            day_names = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
            blocks = ", ".join(
                f"{day_names[d]} {s.strftime('%H:%M')}–{e.strftime('%H:%M')}"
                for d, s, e in schedule
            )
            self.stdout.write(f"  Dr. {first} {last:<12} → {blocks}")

        self.stdout.write(
            "\n" + self.style.WARNING(
                "Note: slots start from J+2 (48h minimum booking delay). "
                "Open /patient-portal/appointments to test the wizard."
            )
        )

    # ─────────────────────────────────────────────────────────────────────────
    def _seed_prebooked_appointments(self, doctors, patients):
        """
        Create 2–3 real Appointment + AppointmentExtension rows so that
        _is_slot_free has something to bump against.
        """
        from apps.crm.models import Appointment, AppointmentExtension

        now = timezone.now()
        # Find the next Monday at least 3 days out (inside the j+2 window but
        # guaranteed to land on a working day for all three doctors).
        target = now.date() + timedelta(days=3)
        while target.weekday() != 0:          # 0 = Monday
            target += timedelta(days=1)

        slots_to_book = [
            # (doctor_key, patient_key, hour, minute, type, duration)
            ("dr_benali",   "Trabelsi",  9,  0,  "simple",   15),
            ("dr_benali",   "Chaabane",  9, 20,  "simple",   15),   # right after previous + gap
            ("dr_kasmi",    "Mejri",    None, None, None, None),     # skip — Kasmi doesn't work Mon
            ("dr_maaroufi", "Bouhamed",  8,  0,  "complex",  30),
        ]

        booked = 0
        for entry in slots_to_book:
            doc_key, pat_key, hour, minute, apt_type, duration = entry
            if hour is None:
                continue

            doc = doctors[doc_key]
            pat = patients[pat_key]

            slot_dt = timezone.make_aware(
                datetime.combine(target, time(hour, minute))
            )

            # Skip if already exists (idempotent)
            already = Appointment.objects.filter(
                patient=pat,
                appointment_date=slot_dt,
                status__in=("scheduled", "confirmed"),
            ).exists()
            if already:
                continue

            apt = Appointment.objects.create(
                patient=pat,
                title=f"[SEED] RDV {apt_type} — {pat}",
                appointment_date=slot_dt,
                status=Appointment.Status.SCHEDULED,
                reason=f"Seed pre-booked slot ({apt_type})",
            )
            AppointmentExtension.objects.create(
                appointment=apt,
                doctor=doc,
                appointment_type=apt_type,
                duration_minutes=duration,
                priority=2,
                confirmation_token="seed-token",
            )
            booked += 1
            self.stdout.write(
                f"  ✔ Pre-booked: {doc.get_full_name()} + {pat} "
                f"on {target} at {hour:02d}:{minute:02d} ({apt_type})"
            )

        if booked == 0:
            self.stdout.write("  ℹ Pre-booked slots already exist — skipped")

    # ─────────────────────────────────────────────────────────────────────────
    def _reset(self):
        from apps.crm.models import (
            Appointment,
            AppointmentExtension,
            DoctorAvailability,
            Patient,
            PatientPortalAccount,
            PatientSchedulingPreferences,
        )

        self.stdout.write(self.style.WARNING("Resetting seed data…"))

        mrns = [s["mrn"] for s in PATIENT_SPECS]
        usernames = [spec[0] for spec in DOCTOR_SPECS]

        # Appointments created by seed (title starts with [SEED])
        Appointment.objects.filter(title__startswith="[SEED]").delete()

        # Portal accounts for seed patients
        PatientPortalAccount.objects.filter(patient__medical_record_number__in=mrns).delete()
        PatientSchedulingPreferences.objects.filter(patient__medical_record_number__in=mrns).delete()
        Patient.objects.filter(medical_record_number__in=mrns).delete()

        # Doctor availabilities (the users themselves are kept — they may have real data)
        DoctorAvailability.objects.filter(doctor__username__in=usernames).delete()

        self.stdout.write(self.style.WARNING("  Reset complete.\n"))

    # ─────────────────────────────────────────────────────────────────────────
    def _verify(self):
        from apps.crm.models import (
            DoctorAvailability,
            Patient,
            PatientPortalAccount,
            Appointment,
        )

        self.stdout.write(self.style.MIGRATE_HEADING("\n── Scheduling seed data summary ──\n"))

        # Doctors
        usernames = [s[0] for s in DOCTOR_SPECS]
        for uname in usernames:
            try:
                u = User.objects.get(username=uname)
                avail_count = DoctorAvailability.objects.filter(doctor=u, is_active=True).count()
                self.stdout.write(f"  Doctor {u.get_full_name()}: {avail_count} availability block(s)")
            except User.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"  Doctor {uname}: NOT FOUND"))

        # Patients
        self.stdout.write("")
        for spec in PATIENT_SPECS:
            try:
                p = Patient.objects.get(medical_record_number=spec["mrn"])
                has_portal = PatientPortalAccount.objects.filter(patient=p).exists()
                self.stdout.write(
                    f"  Patient {p}: portal={'✔' if has_portal else '✘'}"
                )
            except Patient.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"  Patient {spec['mrn']}: NOT FOUND"))

        # Seeded appointments
        self.stdout.write("")
        seed_apts = Appointment.objects.filter(title__startswith="[SEED]")
        self.stdout.write(f"  Pre-booked seed appointments: {seed_apts.count()}")
        for apt in seed_apts:
            self.stdout.write(f"    {apt.appointment_date} — {apt.patient}")