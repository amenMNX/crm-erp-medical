from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.core.exceptions import ValidationError
import secrets
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone

User = get_user_model()

class Machine(models.Model):
    """A radiotherapy machine (LINAC, CT-sim, etc.) available for treatment sessions.
    US-EQUIP-01: full lifecycle with MTBF/MTTR/disponibilité, amortissement, calibration alerts.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        MAINTENANCE = "maintenance", "En maintenance"
        DECOMMISSIONED = "decommissioned", "Hors service"

    # ── Identity ──────────────────────────────────────────────────────────────
    name = models.CharField(max_length=100, unique=True)
    model = models.CharField(max_length=100, blank=True, help_text="Manufacturer / model reference")
    serial_number = models.CharField(max_length=100, blank=True)
    manufacturer = models.CharField(max_length=100, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    # Physical room where this machine is installed.
    # Only rooms with usage=stock or usage=medicalized should be selected.
    room = models.ForeignKey(
        "crm.Room",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="machines",
        help_text="Salle / local où se trouve la machine",
    )
    location = models.CharField(max_length=150, blank=True, help_text="Complément d'adresse (étage, couloir…)")

    # ── Lifecycle & amortissement ─────────────────────────────────────────────
    purchase_date = models.DateField(blank=True, null=True)
    purchase_cost = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True,
                                        help_text="Coût d'acquisition en TND")
    useful_life_years = models.PositiveSmallIntegerField(default=10,
                                                          help_text="Durée d'amortissement en années")
    residual_value = models.DecimalField(max_digits=12, decimal_places=2, default=0,
                                          help_text="Valeur résiduelle TND")

    # ── Calibration ───────────────────────────────────────────────────────────
    last_calibration_date = models.DateField(blank=True, null=True)
    next_calibration_date = models.DateField(blank=True, null=True)
    calibration_interval_days = models.PositiveIntegerField(default=365,
                                                              help_text="Intervalle de calibration en jours")

    # ── Reliability metrics (computed / stored) ───────────────────────────────
    # MTBF & MTTR are stored in hours and updated by maintenance log signals.
    mtbf_hours = models.FloatField(default=0, help_text="Mean Time Between Failures (heures)")
    mttr_hours = models.FloatField(default=0, help_text="Mean Time To Repair (heures)")

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    # ── Computed properties ───────────────────────────────────────────────────
    @property
    def disponibilite(self):
        """Taux de disponibilité = MTBF / (MTBF + MTTR) × 100 %"""
        total = self.mtbf_hours + self.mttr_hours
        if total == 0:
            return None
        return round(self.mtbf_hours / total * 100, 2)

    @property
    def annual_depreciation(self):
        """Amortissement linéaire annuel en TND"""
        if self.purchase_cost is None:
            return None
        life = self.useful_life_years or 1
        from decimal import Decimal
        return round((self.purchase_cost - self.residual_value) / Decimal(str(life)), 2)

    @property
    def book_value(self):
        """Valeur nette comptable actuelle"""
        if self.purchase_cost is None or self.purchase_date is None or self.annual_depreciation is None:
            return None
        from django.utils import timezone
        from decimal import Decimal
        years_elapsed = (timezone.now().date() - self.purchase_date).days / 365.25
        depreciated = self.annual_depreciation * Decimal(str(min(years_elapsed, self.useful_life_years)))
        return max(self.purchase_cost - depreciated, self.residual_value)

    @property
    def calibration_overdue(self):
        """True si la prochaine calibration est dépassée"""
        if not self.next_calibration_date:
            return False
        from django.utils import timezone
        return self.next_calibration_date < timezone.now().date()


class MaintenanceLog(models.Model):
    """Journal des interventions de maintenance sur un équipement (US-EQUIP-01)."""

    class Type(models.TextChoices):
        PREVENTIVE  = "preventive",  "Préventive"
        CORRECTIVE  = "corrective",  "Corrective"
        CALIBRATION = "calibration", "Calibration"
        INSPECTION  = "inspection",  "Inspection"

    class Result(models.TextChoices):
        OK       = "ok",       "OK — Opérationnel"
        REPAIRED = "repaired", "Réparé"
        PARTIAL  = "partial",  "Partiellement résolu"
        FAILED   = "failed",   "Échec / Renvoi fournisseur"

    machine          = models.ForeignKey(Machine, on_delete=models.CASCADE,
                                          related_name="maintenance_logs")
    intervention_type = models.CharField(max_length=20, choices=Type.choices,
                                          default=Type.PREVENTIVE)
    start_datetime   = models.DateTimeField()
    end_datetime     = models.DateTimeField(blank=True, null=True)
    technician       = models.CharField(max_length=150, blank=True)
    description      = models.TextField(blank=True)
    result           = models.CharField(max_length=20, choices=Result.choices,
                                         blank=True)
    cost             = models.DecimalField(max_digits=10, decimal_places=2,
                                            blank=True, null=True,
                                            help_text="Coût de l'intervention TND")
    next_service_date = models.DateField(blank=True, null=True)
    notes            = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_datetime"]

    def __str__(self):
        return f"{self.machine.name} — {self.get_intervention_type_display()} ({self.start_datetime.date()})"

    @property
    def duration_hours(self):
        if self.end_datetime and self.start_datetime:
            delta = self.end_datetime - self.start_datetime
            return round(delta.total_seconds() / 3600, 2)
        return None

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Recompute MTBF/MTTR on the parent machine after any maintenance log change
        self.machine._recompute_reliability()

    def delete(self, *args, **kwargs):
        machine = self.machine
        super().delete(*args, **kwargs)
        machine._recompute_reliability()


# Attach _recompute_reliability to Machine (avoids circular import)
def _machine_recompute_reliability(self):
    """Recompute MTBF and MTTR from corrective maintenance logs."""
    logs = self.maintenance_logs.filter(
        intervention_type=MaintenanceLog.Type.CORRECTIVE,
        end_datetime__isnull=False,
    ).order_by("start_datetime")

    durations = []
    gaps = []
    prev_end = None
    for log in logs:
        dur = (log.end_datetime - log.start_datetime).total_seconds() / 3600
        durations.append(dur)
        if prev_end:
            gap = (log.start_datetime - prev_end).total_seconds() / 3600
            gaps.append(gap)
        prev_end = log.end_datetime

    self.mttr_hours = round(sum(durations) / len(durations), 2) if durations else 0
    self.mtbf_hours = round(sum(gaps) / len(gaps), 2) if gaps else 0
    Machine.objects.filter(pk=self.pk).update(mtbf_hours=self.mtbf_hours, mttr_hours=self.mttr_hours)

Machine._recompute_reliability = _machine_recompute_reliability


class Room(models.Model):
    """
    A physical room / space in the clinic.

    Usage labels (three categories):
      medicalized         — chambre médicalisée : accueil post-opératoire, hospitalisation
                           d'une nuit, etc.  Bookings + machine assignment allowed.
      patient_appointment — salle de rendez-vous patient : consultation, radio,
                           ophtalmologie, etc.  Bookings allowed, machines NOT stored here.
      stock               — local technique / stockage de matériel.
                           Machines are stored here; patient bookings NOT allowed.
    """

    class Status(models.TextChoices):
        ACTIVE      = "active",      "Active"
        MAINTENANCE = "maintenance", "En maintenance"
        CLOSED      = "closed",      "Fermée"

    class Usage(models.TextChoices):
        MEDICALIZED         = "medicalized",         "Chambre médicalisée"
        PATIENT_APPOINTMENT = "patient_appointment", "Salle de rendez-vous"
        OPERATION_ROOM      = "operation_room",      "Salle d'opération"
        STOCK               = "stock",               "Stock / Local technique"

    name      = models.CharField(max_length=100, unique=True)
    usage     = models.CharField(
        max_length=30,
        choices=Usage.choices,
        default=Usage.PATIENT_APPOINTMENT,
        help_text=(
            "medicalized = chambre post-op/nuit ; "
            "patient_appointment = consultation/radio/ophtalmo ; "
            "stock = local matériel"
        ),
    )
    # Specialty — relevant for patient_appointment rooms
    specialty = models.CharField(
        max_length=100, blank=True,
        help_text="Ex : Radiologie, Ophtalmologie, Consultation générale",
    )
    location  = models.CharField(max_length=150, blank=True, help_text="Bâtiment / étage / aile")
    capacity  = models.PositiveSmallIntegerField(
        default=1,
        help_text="Nombre maximum d'occupants (patient + accompagnants). Ignoré pour Stock.",
    )
    status    = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    notes     = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        label = dict(self.Usage.choices).get(self.usage, self.usage)
        return f"{self.name} [{label}]"

    @property
    def is_available(self):
        """True when the room is active."""
        return self.status == self.Status.ACTIVE

    @property
    def bookings_allowed(self):
        """Patient bookings are only allowed in medicalized and patient_appointment rooms."""
        return self.usage in (self.Usage.MEDICALIZED, self.Usage.PATIENT_APPOINTMENT , self.Usage.OPERATION_ROOM,)


class RoomBooking(models.Model):
    """
    A time-slot reservation for a room.

    occupants: total number of people present
      1  → patient alone
      2  → patient + 1 companion
      3  → patient + 2 companions (capped at room.capacity)
    """

    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmée"
        PENDING   = "pending",   "En attente"
        CANCELLED = "cancelled", "Annulée"
        COMPLETED = "completed", "Terminée"

    room    = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="bookings")
    patient = models.ForeignKey(
        "crm.Patient", on_delete=models.CASCADE, related_name="room_bookings"
    )
    occupants        = models.PositiveSmallIntegerField(
        default=1,
        help_text="Nombre total d'occupants (patient + accompagnants)",
    )
    notes_companions = models.CharField(
        max_length=255, blank=True,
        help_text="Ex : épouse + infirmière, mère",
    )

    start_datetime = models.DateTimeField()
    end_datetime   = models.DateTimeField()
    status         = models.CharField(
        max_length=20, choices=Status.choices, default=Status.CONFIRMED
    )
    reason  = models.CharField(max_length=255, blank=True)
    notes   = models.TextField(blank=True)

    booked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="room_bookings_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering            = ["start_datetime"]
        verbose_name        = "Réservation de salle"
        verbose_name_plural = "Réservations de salles"

    def __str__(self):
        return (
            f"{self.room.name} — {self.patient} "
            f"[{self.start_datetime:%d/%m/%Y %H:%M}–{self.end_datetime:%H:%M}]"
        )

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError("La fin doit être postérieure au début.")
        if self.room_id and self.occupants and self.occupants > self.room.capacity:
            raise ValidationError(
                f"Le nombre d'occupants ({self.occupants}) dépasse la capacité "
                f"de la salle ({self.room.capacity})."
            )

    def has_conflict(self):
        """True if another confirmed/pending booking overlaps this one in the same room."""
        qs = RoomBooking.objects.filter(
            room=self.room,
            status__in=[self.Status.CONFIRMED, self.Status.PENDING],
            start_datetime__lt=self.end_datetime,
            end_datetime__gt=self.start_datetime,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        return qs.exists()


def _generate_mrn() -> str:
    """Generate a unique Medical Record Number in the format MRN-YYYY-NNNN.

    Uses the current year and the next available sequence number.
    Collision-safe: if the candidate already exists (e.g. after a deletion
    left a gap), we increment until we find a free slot.
    Called from Patient.save() when medical_record_number is blank.
    """
    from django.utils import timezone
    year = timezone.now().year
    last = (
        Patient.objects.filter(medical_record_number__startswith=f"MRN-{year}-")
        .order_by("-medical_record_number")
        .first()
    )
    if last:
        try:
            seq = int(last.medical_record_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    candidate = f"MRN-{year}-{seq:04d}"
    while Patient.objects.filter(medical_record_number=candidate).exists():
        seq += 1
        candidate = f"MRN-{year}-{seq:04d}"
    return candidate

# ─── NEW MODELS (paste after RoomBooking) ────────────────────────────────────

class OperationBooking(models.Model):
    """
    A reservation of an operation_room for a surgical procedure.

    Differences from RoomBooking:
      - Room must have usage = operation_room.
      - Optional second patient when with_donor=True (e.g. organ donation).
      - Staff assignments via OperationStaff (doctors + nurses).
    """

    class Status(models.TextChoices):
        CONFIRMED = "confirmed", "Confirmée"
        PENDING   = "pending",   "En attente"
        CANCELLED = "cancelled", "Annulée"
        COMPLETED = "completed", "Terminée"

    room = models.ForeignKey(
        "crm.Room",
        on_delete=models.CASCADE,
        related_name="operation_bookings",
        help_text="Doit être une salle d'opération (usage=operation_room).",
    )

    # Primary patient (always required)
    patient = models.ForeignKey(
        "crm.Patient",
        on_delete=models.CASCADE,
        related_name="operation_bookings",
    )

    # Donor patient — only when with_donor is True
    with_donor = models.BooleanField(
        default=False,
        help_text="Cocher si l'opération implique un donneur.",
    )
    donor_patient = models.ForeignKey(
        "crm.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operation_bookings_as_donor",
        help_text="Patient donneur (organe, sang, moelle, etc.).",
    )

    start_datetime = models.DateTimeField()
    end_datetime   = models.DateTimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CONFIRMED,
    )

    operation_type = models.CharField(
        max_length=200,
        blank=True,
        help_text="Ex : Cholécystectomie, Greffe rénale, Appendicectomie",
    )
    notes = models.TextField(blank=True)

    booked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="operation_bookings_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering            = ["start_datetime"]
        verbose_name        = "Réservation de bloc opératoire"
        verbose_name_plural = "Réservations de bloc opératoire"

    def __str__(self):
        donor = f" + donneur: {self.donor_patient}" if self.with_donor and self.donor_patient else ""
        return (
            f"{self.room.name} — {self.patient}{donor} "
            f"[{self.start_datetime:%d/%m/%Y %H:%M}–{self.end_datetime:%H:%M}]"
        )

    def clean(self):
        if self.end_datetime and self.start_datetime and self.end_datetime <= self.start_datetime:
            raise ValidationError("La fin doit être postérieure au début.")
        if self.room_id:
            from crm.models import Room
            if self.room.usage != Room.Usage.OPERATION_ROOM:
                raise ValidationError(
                    f"La salle « {self.room.name} » n'est pas une salle d'opération."
                )
        if self.with_donor and not self.donor_patient_id:
            raise ValidationError(
                "Un patient donneur doit être sélectionné quand 'avec donneur' est coché."
            )
        if self.donor_patient_id and self.donor_patient_id == self.patient_id:
            raise ValidationError(
                "Le patient et le donneur ne peuvent pas être la même personne."
            )

    def has_conflict(self):
        """True if another confirmed/pending operation booking overlaps in the same room."""
        qs = OperationBooking.objects.filter(
            room=self.room,
            status__in=[self.Status.CONFIRMED, self.Status.PENDING],
            start_datetime__lt=self.end_datetime,
            end_datetime__gt=self.start_datetime,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        return qs.exists()


class OperationStaff(models.Model):
    """
    Links an employee (doctor / nurse) to an OperationBooking with their role.
    One employee can only appear once per operation (unique_together).
    """

    operation = models.ForeignKey(
        OperationBooking,
        on_delete=models.CASCADE,
        related_name="staff_assignments",
    )
    # Lazy import avoids circular dependency: hr → crm would be circular.
    employee = models.ForeignKey(
        "hr.Employee",
        on_delete=models.CASCADE,
        related_name="operation_assignments",
    )
    role = models.CharField(
        max_length=100,
        help_text="Rôle dans l'opération : Chirurgien principal, Anesthésiste, Infirmier(e) de bloc…",
    )

    class Meta:
        unique_together     = [("operation", "employee")]
        verbose_name        = "Personnel assigné"
        verbose_name_plural = "Personnel assigné"

    def __str__(self):
        return f"{self.employee} — {self.role} ({self.operation})"

class Patient(models.Model):
    # ── CNAM coverage scheme ──────────────────────────────────────────────────
    # Tunisia's CNAM runs three distinct pathways that determine how an invoice
    # is split between what the patient pays at the counter and what CNAM settles
    # directly with the clinic. This choice is made at affiliation time and can
    # be updated annually (October–November window).
    class CnamScheme(models.TextChoices):
        NONE          = "none",          "Sans couverture CNAM"
        PUBLIC        = "public",        "Filière publique (CNSS/hôpital)"
        REMBOURSEMENT = "remboursement", "Filière remboursement"
        TIERS_PAYANT  = "tiers_payant",  "Tiers payant (médecin traitant)"

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    cin = models.CharField(max_length=20, unique=True, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    birth_date = models.DateField(blank=True, null=True)
    address = models.TextField(blank=True)

    # MRN is auto-generated on first save if left blank.
    # Callers may supply their own value (e.g. migrating from a legacy system)
    # but the field is still enforced as unique at DB level.
    medical_record_number = models.CharField(max_length=50, unique=True, blank=True)
    diagnosis = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    # ── CNAM fields ───────────────────────────────────────────────────────────
    cnam_scheme = models.CharField(
        max_length=20,
        choices=CnamScheme.choices,
        default=CnamScheme.NONE,
        help_text="Filière CNAM choisie par l'assuré lors de son affiliation.",
    )
    cnam_affiliation_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Numéro d'affiliation CNAM (CNSS ou CNRPS).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    def save(self, *args, **kwargs):
        # Auto-generate MRN on creation if not supplied by the caller.
        if not self.medical_record_number:
            self.medical_record_number = _generate_mrn()
        super().save(*args, **kwargs)
    
class Appointment(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"
        DONE = "done", "Done"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    title = models.CharField(max_length=150)
    appointment_date = models.DateTimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["appointment_date"]

    def __str__(self):
        return f"{self.title} - {self.patient}"

class TreatmentPlan(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="treatment_plans",
    )
    name = models.CharField(max_length=150)
    diagnosis = models.TextField(blank=True)
    protocol = models.TextField(blank=True)
    total_sessions = models.PositiveIntegerField(default=0)
    dose_per_session = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    total_dose = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.patient}"
    
class TreatmentSession(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        MISSED = "missed", "Missed"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="treatment_sessions",
    )
    treatment_plan = models.ForeignKey(
        TreatmentPlan,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    session_number = models.PositiveIntegerField()
    scheduled_datetime = models.DateTimeField()
    actual_datetime = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    machine = models.ForeignKey(
        Machine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions",
    )
    room = models.ForeignKey(
        Room,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sessions",
    )
    dose_delivered = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_datetime", "session_number"]
        unique_together = ("treatment_plan", "session_number")

    def __str__(self):
        return f"Session {self.session_number} - {self.patient}"

    @property
    def cumulative_dose(self):
        """Sum of dose_delivered across all COMPLETED sessions on this plan
        including this session if it is already completed."""
        from django.db.models import Sum
        qs = TreatmentSession.objects.filter(
            treatment_plan_id=self.treatment_plan_id,
            status=TreatmentSession.Status.COMPLETED,
        )
        return qs.aggregate(total=Sum("dose_delivered"))["total"] or 0

    def clean(self):
        """Dose safety guard — blocks saving a session whose dose would push
        the cumulative total past the plan's prescribed dose.

        90–100 % of total_dose → ValidationError with level WARNING.
        The frontend shows a yellow alert; a doctor can acknowledge and
        resubmit. The backend still blocks — the doctor must update the
        plan's total_dose before the session can be saved.

        > 100 % of total_dose → hard block, always.
        """
        if not self.treatment_plan_id or not self.dose_delivered:
            return

        plan = self.treatment_plan
        if not plan.total_dose or float(plan.total_dose) <= 0:
            return

        from django.db.models import Sum
        qs = TreatmentSession.objects.filter(
            treatment_plan=plan,
            status=TreatmentSession.Status.COMPLETED,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)

        cumulative_others = qs.aggregate(total=Sum("dose_delivered"))["total"] or 0
        cumulative_with_this = float(cumulative_others) + float(self.dose_delivered)
        ratio = cumulative_with_this / float(plan.total_dose)

        if ratio > 1.0:
            raise ValidationError({
                "dose_delivered": (
                    f"BLOCAGE : La dose cumulée ({cumulative_with_this:.2f} Gy) "
                    f"dépasserait la dose totale prescrite ({plan.total_dose:.2f} Gy). "
                    "Modifiez le plan de traitement avant de continuer."
                )
            })
        if ratio >= 0.9:
            raise ValidationError({
                "dose_delivered": (
                    f"ALERTE 90% : La dose cumulée atteindra {cumulative_with_this:.2f} Gy "
                    f"({ratio * 100:.0f}% de {plan.total_dose:.2f} Gy prescrits). "
                    "Vérifiez avec le médecin responsable avant de valider."
                )
            })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
        # Auto-complete the plan when all sessions are done.
        plan = self.treatment_plan
        if plan.status == TreatmentPlan.Status.ACTIVE:
            all_done = not plan.sessions.exclude(
                status__in=[
                    TreatmentSession.Status.COMPLETED,
                    TreatmentSession.Status.CANCELLED,
                ]
            ).exists()
            if all_done:
                TreatmentPlan.objects.filter(pk=plan.pk).update(
                    status=TreatmentPlan.Status.COMPLETED
                )


class Ticket(models.Model):
    # Values match the frontend's TicketPriority/TicketStatus string unions
    # exactly (frontend/src/lib/domain.ts) so no translation layer is needed
    # between what the UI sends and what gets stored.
    class Priority(models.TextChoices):
        FAIBLE = "Faible", "Faible"
        MOYENNE = "Moyenne", "Moyenne"
        ELEVEE = "Élevée", "Élevée"
        CRITIQUE = "Critique", "Critique"

    class Status(models.TextChoices):
        NOUVEAU = "Nouveau", "Nouveau"
        EN_COURS = "En cours", "En cours"
        EN_ATTENTE = "En attente", "En attente"
        RESOLU = "Résolu", "Résolu"
        FERME = "Fermé", "Fermé"

    # SLA resolution deadlines per priority (in hours).
    # These match the matrice SLA in the cahier des charges §3.1.
    SLA_HOURS: dict[str, int] = {
        "Critique": 4,
        "Élevée":   24,
        "Moyenne":  72,
        "Faible":   168,  # 7 days
    }

    numero = models.CharField(max_length=50, unique=True, editable=False)
    titre = models.CharField(max_length=255)
    description = models.TextField()
    priorite = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.FAIBLE,
    )
    statut = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOUVEAU,
    )
    client = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="tickets",
    )
    agents = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="assigned_tickets",
        blank=True,
    )

    # ── SLA fields ────────────────────────────────────────────────────────────
    # sla_deadline: computed at creation from priorite → SLA_HOURS.
    # Stored on the model so the SLA engine can query it efficiently without
    # recomputing it every time.
    sla_deadline = models.DateTimeField(
        null=True, blank=True,
        help_text="Auto-set at creation: created_at + SLA hours for this priority.",
    )
    # sla_breached: set to True by the SLA engine command when now > sla_deadline
    # and the ticket is still open. Stored so the dashboard can filter/count
    # breached tickets with a simple DB query instead of Python-side filtering.
    sla_breached = models.BooleanField(
        default=False,
        help_text="Set by the SLA engine when the resolution deadline is missed.",
    )
    # resolved_at: set automatically when statut transitions to Résolu or Fermé.
    resolved_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.numero} - {self.titre}"

    # ── SLA helpers ───────────────────────────────────────────────────────────

    @property
    def sla_hours(self) -> int:
        """Resolution SLA in hours for this ticket's priority."""
        return self.SLA_HOURS.get(self.priorite, 168)

    @property
    def is_open(self) -> bool:
        return self.statut not in (self.Status.RESOLU, self.Status.FERME)

    @property
    def sla_status(self) -> str:
        """Human-readable SLA status for the serializer / frontend badge.

        Returns one of: 'ok' | 'warning' | 'breached' | 'resolved'
        - 'resolved'  ticket is closed — SLA no longer relevant
        - 'ok'        deadline not yet reached
        - 'warning'   within the last 25% of the allowed window (yellow)
        - 'breached'  past the deadline (red)
        """
        if not self.is_open:
            return "resolved"
        if self.sla_breached:
            return "breached"
        if not self.sla_deadline:
            return "ok"
        from django.utils import timezone
        now = timezone.now()
        if now >= self.sla_deadline:
            return "breached"
        # Warning: entered the last 25% of the SLA window
        total_seconds = self.sla_hours * 3600
        elapsed = (now - self.created_at).total_seconds()
        if elapsed >= total_seconds * 0.75:
            return "warning"
        return "ok"

    @property
    def sla_remaining_minutes(self) -> int | None:
        """Minutes remaining until SLA deadline. Negative if already breached."""
        if not self.sla_deadline or not self.is_open:
            return None
        from django.utils import timezone
        delta = self.sla_deadline - timezone.now()
        return int(delta.total_seconds() / 60)

    def save(self, *args, **kwargs):
        from django.utils import timezone

        is_new = self.pk is None

        # Auto-generate ticket number on creation
        if not self.numero:
            self.numero = self._generate_numero()

        # Set SLA deadline once at creation based on priority
        if is_new and not self.sla_deadline:
            self.sla_deadline = timezone.now() + timezone.timedelta(
                hours=self.sla_hours
            )

        # Auto-set resolved_at when ticket is closed
        terminal = (self.Status.RESOLU, self.Status.FERME)
        if self.statut in terminal and not self.resolved_at:
            self.resolved_at = timezone.now()
        elif self.statut not in terminal:
            self.resolved_at = None

        # Clear breach flag if ticket is resolved
        if not self.is_open:
            self.sla_breached = False

        super().save(*args, **kwargs)

    @staticmethod
    def _generate_numero():
        last = Ticket.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        candidate = f"TCK-{next_id:03d}"
        while Ticket.objects.filter(numero=candidate).exists():
            next_id += 1
            candidate = f"TCK-{next_id:03d}"
        return candidate


class Incident(models.Model):
    # Distinct from Ticket per cahier des charges §3 Périmètre, which lists
    # "gestion des incidents" separately from "gestion des tickets" and
    # "gestion des réclamations". Mirrors Ticket's priority/status shape so
    # the two stay easy to compare, but is its own entity/workflow.
    class Priority(models.TextChoices):
        FAIBLE = "Faible", "Faible"
        MOYENNE = "Moyenne", "Moyenne"
        ELEVEE = "Élevée", "Élevée"
        CRITIQUE = "Critique", "Critique"

    class Status(models.TextChoices):
        NOUVEAU = "Nouveau", "Nouveau"
        EN_COURS = "En cours", "En cours"
        EN_ATTENTE = "En attente", "En attente"
        RESOLU = "Résolu", "Résolu"
        FERME = "Fermé", "Fermé"

    numero = models.CharField(max_length=50, unique=True, editable=False)
    titre = models.CharField(max_length=255)
    description = models.TextField()
    priorite = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.FAIBLE,
    )
    statut = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOUVEAU,
    )
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="incidents",
        blank=True,
        null=True,
    )
    equipment_or_location = models.CharField(max_length=255, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="reported_incidents",
        blank=True,
        null=True,
    )
    agents = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="assigned_incidents",
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.numero} - {self.titre}"

    def save(self, *args, **kwargs):
        if not self.numero:
            self.numero = self._generate_numero()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_numero():
        last = Incident.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        candidate = f"INC-{next_id:03d}"
        while Incident.objects.filter(numero=candidate).exists():
            next_id += 1
            candidate = f"INC-{next_id:03d}"
        return candidate


class Complaint(models.Model):
    # Values match frontend/src/lib/domain.ts ComplaintStatus exactly.
    class Status(models.TextChoices):
        NOUVELLE = "Nouvelle", "Nouvelle"
        EN_TRAITEMENT = "En traitement", "En traitement"
        RESOLUE = "Résolue", "Résolue"
        FERMEE = "Fermée", "Fermée"

    description = models.TextField()
    statut = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NOUVELLE,
    )
    client = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="complaints",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Complaint #{self.id} - {self.client}"

    def save(self, *args, **kwargs):
        if self.statut in (self.Status.RESOLUE, self.Status.FERMEE) and not self.resolved_at:
            from django.utils import timezone
            self.resolved_at = timezone.now()
        elif self.statut not in (self.Status.RESOLUE, self.Status.FERMEE):
            self.resolved_at = None
        super().save(*args, **kwargs)

class TicketComment(models.Model):
    """An agent intervention or comment on a Ticket.

    Distinct from AuditLogEntry (which records *what* changed) — this is
    a free-text note the agent intentionally writes to document their work,
    communicate with colleagues, or record the resolution steps taken.
    This is the "historique interventions" / "commentaires" workflow the
    DOCX requires alongside the ticket status lifecycle.
    """

    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="ticket_comments",
    )
    body = models.TextField()
    # Mark as "intervention" (field visit, call, remote action) vs plain note,
    # so the UI can filter or badge them separately.
    is_intervention = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on {self.ticket.numero} by {self.author}"
 
# ─── 1. Compte Portail Patient ────────────────────────────────────────────────
 
class PatientPortalAccount(models.Model):
    """
    Compte d'accès au portail pour un patient.
    Distinct du modèle User du staff — authentification par email + mot de passe.
    """
    patient = models.OneToOneField(
        "Patient",
        on_delete=models.CASCADE,
        related_name="portal_account",
    )
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
 
    # Notifications opt-in / opt-out
    notify_email = models.BooleanField(default=True)
    notify_sms = models.BooleanField(default=False)
 
    # Sécurité
    last_login = models.DateTimeField(null=True, blank=True)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
 
    # Reset de mot de passe
    reset_token = models.CharField(max_length=64, blank=True)
    reset_token_expires = models.DateTimeField(null=True, blank=True)
 
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
 
    class Meta:
        verbose_name = "Compte Portail Patient"
        verbose_name_plural = "Comptes Portail Patients"
 
    def __str__(self):
        return f"Portal: {self.email} ({self.patient})"
 
    def set_password(self, raw_password: str):
        self.password_hash = make_password(raw_password)
 
    def check_password(self, raw_password: str) -> bool:
        return check_password(raw_password, self.password_hash)
 
    def generate_reset_token(self) -> str:
        token = secrets.token_urlsafe(32)
        self.reset_token = token
        self.reset_token_expires = timezone.now() + timezone.timedelta(hours=2)
        return token
 
    @property
    def is_locked(self) -> bool:
        if self.locked_until and timezone.now() < self.locked_until:
            return True
        return False
 
    def record_failed_login(self):
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.locked_until = timezone.now() + timezone.timedelta(minutes=15)
        self.save(update_fields=["failed_login_attempts", "locked_until"])
 
    def record_successful_login(self):
        self.failed_login_attempts = 0
        self.locked_until = None
        self.last_login = timezone.now()
        self.save(update_fields=["failed_login_attempts", "locked_until", "last_login"])
 
 
# ─── 2. Session Portail (JWT-less — token opaque en cookie) ──────────────────
 
class PatientPortalSession(models.Model):
    account = models.ForeignKey(
        PatientPortalAccount,
        on_delete=models.CASCADE,
        related_name="sessions",
    )
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=256, blank=True)
 
    class Meta:
        ordering = ["-created_at"]
 
    @classmethod
    def create_for(cls, account: PatientPortalAccount, ip=None, ua="") -> "PatientPortalSession":
        token = secrets.token_urlsafe(32)
        expires = timezone.now() + timezone.timedelta(minutes=30)
        return cls.objects.create(
            account=account,
            token=token,
            expires_at=expires,
            ip_address=ip,
            user_agent=ua[:256],
        )
 
    @property
    def is_valid(self) -> bool:
        return timezone.now() < self.expires_at
 
    def refresh(self):
        """Renouvelle la session (30 min d'inactivité)."""
        self.expires_at = timezone.now() + timezone.timedelta(minutes=30)
        self.save(update_fields=["expires_at"])
 
 
# ─── 3. Message Portail (messagerie sécurisée patient ↔ équipe) ──────────────
 
class PortalMessage(models.Model):
    class Direction(models.TextChoices):
        PATIENT_TO_STAFF = "patient_to_staff", "Patient → Staff"
        STAFF_TO_PATIENT = "staff_to_patient", "Staff → Patient"
 
    patient = models.ForeignKey(
        "Patient",
        on_delete=models.CASCADE,
        related_name="portal_messages",
    )
    direction = models.CharField(max_length=20, choices=Direction.choices)
    # Si envoyé par le staff, référence à l'utilisateur
    staff_author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="portal_messages_sent",
    )
    subject = models.CharField(max_length=200, blank=True)
    content = models.TextField()
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
 
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ["-created_at"]
 
    def __str__(self):
        return f"[{self.direction}] {self.patient} — {self.created_at:%Y-%m-%d %H:%M}"
 
    def mark_read(self):
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])
 
 
# ─── 4. Notation Expérience Patient (anonyme) ────────────────────────────────
 
class PatientRating(models.Model):
    patient = models.ForeignKey(
        "Patient",
        on_delete=models.CASCADE,
        related_name="ratings",
    )
    score = models.PositiveSmallIntegerField()  # 1–5
    comment = models.TextField(blank=True)
    is_anonymous = models.BooleanField(default=True)
    # Lié à une séance spécifique (optionnel)
    treatment_session = models.ForeignKey(
        "TreatmentSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ratings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ["-created_at"]
 
    def clean(self):
        from django.core.exceptions import ValidationError
        if not (1 <= self.score <= 5):
            raise ValidationError("Le score doit être entre 1 et 5.")
 
    def __str__(self):
        return f"Rating {self.score}/5 — {self.patient} ({self.created_at:%Y-%m-%d})"
 
 
# ─── 5. Document Portail (documents téléchargeables) ────────────────────────
 
class PatientDocument(models.Model):
    class DocumentType(models.TextChoices):
        COMPTE_RENDU = "compte_rendu", "Compte-rendu"
        ORDONNANCE = "ordonnance", "Ordonnance"
        IMAGERIE = "imagerie", "Imagerie"
        PROTOCOLE = "protocole", "Protocole de traitement"
        FACTURE = "facture", "Facture"
        AUTRE = "autre", "Autre"

    patient = models.ForeignKey(
        "Patient",
        on_delete=models.CASCADE,
        related_name="documents",
    )
    document_type = models.CharField(max_length=20, choices=DocumentType.choices)
    title = models.CharField(max_length=200)
    # Stockage : chemin relatif ou URL CDN
    file_path = models.CharField(max_length=500)
    file_size_kb = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_documents",
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ["-created_at"]
 
    def __str__(self):
        return f"{self.document_type} — {self.patient} — {self.title}"
    
# ─── 1. Disponibilités des médecins ──────────────────────────────────────────
 
class DoctorAvailability(models.Model):
    """
    Créneaux de disponibilité hebdomadaires d'un médecin.
    Chaque ligne = un bloc de disponibilité récurrent (ex: Lundi 8h-12h).
    """
    class DayOfWeek(models.IntegerChoices):
        MONDAY    = 0, "Lundi"
        TUESDAY   = 1, "Mardi"
        WEDNESDAY = 2, "Mercredi"
        THURSDAY  = 3, "Jeudi"
        FRIDAY    = 4, "Vendredi"
        SATURDAY  = 5, "Samedi"
 
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availabilities",
        limit_choices_to={"profile__role": "doctor"},
    )
    day_of_week = models.IntegerField(choices=DayOfWeek.choices)
    start_time  = models.TimeField()
    end_time    = models.TimeField()
    is_active   = models.BooleanField(default=True)
    room = models.ForeignKey(
        "Room",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="doctor_availabilities",
        help_text="Salle dédiée à ce créneau (optionnel).",
    )
 
    class Meta:
        ordering = ["day_of_week", "start_time"]
        verbose_name = "Disponibilité Médecin"
 
    def __str__(self):
        return f"{self.doctor} — {self.get_day_of_week_display()} {self.start_time}–{self.end_time}"
 
 
# ─── 2. Préférences patient pour les rendez-vous ─────────────────────────────
 
class PatientSchedulingPreferences(models.Model):
    """
    Préférences de planification d'un patient.
    Un seul enregistrement par patient (OneToOne).
    """
    class TimeSlot(models.TextChoices):
        MORNING   = "morning",   "Matin (8h–12h)"
        AFTERNOON = "afternoon", "Après-midi (12h–17h)"
        ANY       = "any",       "Indifférent"
 
    patient = models.OneToOneField(
        "Patient",
        on_delete=models.CASCADE,
        related_name="scheduling_preferences",
    )
    preferred_time_slot = models.CharField(
        max_length=20,
        choices=TimeSlot.choices,
        default=TimeSlot.ANY,
    )
    # Jours préférés (JSON list d'entiers 0-6)
    preferred_days = models.JSONField(default=list, blank=True)
    # Médecin préféré
    preferred_doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="preferred_by_patients",
    )
 
    class Meta:
        verbose_name = "Préférences de Planification"
 
    def __str__(self):
        return f"Préférences RDV — {self.patient}"
 
 
# ─── 3. Extension du modèle Appointment (champs additionnels) ────────────────
 
class AppointmentExtension(models.Model):
    """
    Étend le modèle Appointment existant sans le modifier.
    Relation OneToOne sur Appointment.
    """
    class AppointmentType(models.TextChoices):
        SIMPLE   = "simple",   "Consultation simple (15 min)"
        COMPLEX  = "complex",  "Consultation complexe (30 min)"
        FOLLOWUP = "followup", "Suivi de traitement (45 min)"
        URGENCY  = "urgency",  "Urgence"
 
    class Priority(models.IntegerChoices):
        URGENCY  = 1, "Urgence (P1)"
        FOLLOWUP = 2, "Suivi (P2)"
        ANNUAL   = 3, "Annuel (P3)"
 
    appointment = models.OneToOneField(
        "Appointment",
        on_delete=models.CASCADE,
        related_name="extension",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="appointments_as_doctor",
        limit_choices_to={"profile__role": "doctor"},
    )
    room = models.ForeignKey(
        "Room",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="appointments",
    )
    machine = models.ForeignKey(
        "Machine",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="appointments",
    )
    appointment_type  = models.CharField(max_length=20, choices=AppointmentType.choices, default=AppointmentType.SIMPLE)
    duration_minutes  = models.PositiveSmallIntegerField(default=15)
    priority          = models.IntegerField(choices=Priority.choices, default=Priority.FOLLOWUP)
 
    # Scores de l'algorithme de planification
    relevance_score = models.FloatField(null=True, blank=True)
 
    # Confirmation patient
    confirmation_token   = models.CharField(max_length=64, blank=True)
    confirmation_deadline= models.DateTimeField(null=True, blank=True)
    confirmed_at         = models.DateTimeField(null=True, blank=True)
 
    # Rappels envoyés
    reminder_7d_sent = models.BooleanField(default=False)
    reminder_3d_sent = models.BooleanField(default=False)
    reminder_1d_sent = models.BooleanField(default=False)
 
    class Meta:
        verbose_name = "Extension Rendez-vous"
 
    def __str__(self):
        return f"Ext. RDV #{self.appointment_id}"
 
    def get_duration_from_type(self) -> int:
        """Retourne la durée standard selon le type de RDV."""
        durations = {"simple": 15, "complex": 30, "followup": 45, "urgency": 30}
        return durations.get(self.appointment_type, 15)
 
 
# ─── 4. Créneau proposé (résultat de l'algorithme) ───────────────────────────
 
class SlotSuggestion(models.Model):
    """
    Stocke les 3 créneaux proposés par l'algorithme pour un patient.
    Expire après 48h si non confirmé.
    """
    class SuggestionType(models.TextChoices):
        CLOSEST    = "closest",    "Le plus proche"
        BEST_MATCH = "best_match", "Le plus adapté aux préférences"
        FLEXIBLE   = "flexible",   "Le plus flexible"
 
    patient = models.ForeignKey(
        "Patient",
        on_delete=models.CASCADE,
        related_name="slot_suggestions",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="slot_suggestions",
    )
    room = models.ForeignKey(
        "Room",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="slot_suggestions",
    )
    machine = models.ForeignKey(
        "Machine",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="slot_suggestions",
    )
    suggestion_type  = models.CharField(max_length=20, choices=SuggestionType.choices)
    proposed_date    = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=15)
    relevance_score  = models.FloatField(default=0.0)
 
    # Statut de la suggestion
    is_accepted = models.BooleanField(default=False)
    is_expired  = models.BooleanField(default=False)
    expires_at  = models.DateTimeField()
 
    # RDV créé si accepté
    appointment = models.ForeignKey(
        "Appointment",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="from_suggestions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
 
    class Meta:
        ordering = ["-relevance_score"]
 
    def __str__(self):
        return f"Suggestion {self.suggestion_type} — {self.patient} — {self.proposed_date:%Y-%m-%d %H:%M}"
 
    @property
    def is_valid(self) -> bool:
        return not self.is_expired and timezone.now() < self.expires_at
 
 
# ─── 5. Liste d'attente ───────────────────────────────────────────────────────
 
class WaitingList(models.Model):
    """
    Patients en attente d'un créneau libéré suite à un désistement.
    """
    patient = models.ForeignKey(
        "Patient",
        on_delete=models.CASCADE,
        related_name="waiting_list_entries",
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="waiting_list",
    )
    appointment_type  = models.CharField(max_length=20, default="simple")
    priority          = models.IntegerField(default=2)
    earliest_date     = models.DateField(null=True, blank=True)
    latest_date       = models.DateField(null=True, blank=True)
 
    # Réponse du patient à une proposition
    proposed_slot     = models.DateTimeField(null=True, blank=True)
    proposal_expires  = models.DateTimeField(null=True, blank=True)
    proposal_accepted = models.BooleanField(null=True, blank=True)
 
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
 
    class Meta:
        ordering = ["priority", "created_at"]
        verbose_name = "Liste d'attente"
 
    def __str__(self):
        return f"Attente — {self.patient} (P{self.priority})"
 
    @property
    def proposal_still_valid(self) -> bool:
        if not self.proposal_expires:
            return False
        return timezone.now() < self.proposal_expires

# ─────────────────────────────────────────────────────────────────────────────
# US-TRT-05 — Protocoles de Traitement
# À coller à la fin de backend/apps/crm/models.py
# ─────────────────────────────────────────────────────────────────────────────


class TreatmentProtocol(models.Model):
    """
    Référentiel de protocole de radiothérapie.
    Workflow : draft → pending → approved → archived
    Le champ TreatmentPlan.protocol (TextField) peut référencer le nom ou l'id.
    """

    class Status(models.TextChoices):
        DRAFT    = "draft",    "Brouillon"
        PENDING  = "pending",  "En attente d'approbation"
        APPROVED = "approved", "Approuvé"
        ARCHIVED = "archived", "Archivé"

    class RadiationType(models.TextChoices):
        PHOTON        = "photon",        "Photons X"
        ELECTRON      = "electron",      "Électrons"
        PROTON        = "proton",        "Protons"
        NEUTRON       = "neutron",       "Neutrons"
        BRACHYTHERAPY = "brachytherapy", "Curiethérapie"

    class FractionInterval(models.TextChoices):
        DAILY       = "daily",       "Quotidien (5j/semaine)"
        TWICE_DAILY = "twice_daily", "2× par jour"
        WEEKLY      = "weekly",      "Hebdomadaire"
        CUSTOM      = "custom",      "Personnalisé"

    # Versioning — parent pointe sur la version précédente
    parent  = models.ForeignKey(
        "self",
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="children",
    )
    version = models.PositiveSmallIntegerField(default=1)

    # Identification médicale
    name                   = models.CharField(max_length=200)
    icd10_code             = models.CharField(max_length=20, blank=True)
    icd10_label            = models.CharField(max_length=255, blank=True)
    cancer_type            = models.CharField(max_length=150, blank=True)
    international_reference = models.CharField(max_length=255, blank=True)

    # Dosimétrie
    radiation_type       = models.CharField(
        max_length=20,
        choices=RadiationType.choices,
        default=RadiationType.PHOTON,
    )
    total_dose_gy        = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    dose_per_fraction_gy = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    number_of_fractions  = models.PositiveSmallIntegerField(default=0)
    fraction_interval    = models.CharField(
        max_length=20,
        choices=FractionInterval.choices,
        default=FractionInterval.DAILY,
    )
    total_duration_days  = models.PositiveSmallIntegerField(default=0)

    # Instructions cliniques
    description               = models.TextField(blank=True)
    preparation_instructions  = models.TextField(blank=True)
    contraindications         = models.TextField(blank=True)

    # Workflow
    status      = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    created_by  = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="protocols_created",
    )
    approved_by = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="protocols_approved",
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Protocole de traitement"
        verbose_name_plural = "Protocoles de traitement"

    def __str__(self):
        return f"{self.name} v{self.version}"

    # ── Computed helpers ────────────────────────────────────────────────────

    @property
    def computed_total_dose(self) -> str:
        """dose_per_fraction × number_of_fractions, arrondi 2 décimales."""
        if self.dose_per_fraction_gy and self.number_of_fractions:
            return f"{float(self.dose_per_fraction_gy) * self.number_of_fractions:.2f}"
        return "0.00"

    @property
    def computed_duration_days(self) -> int:
        """
        Estimation durée selon intervalle et nombre de fractions.
        daily       → fractions / 5 × 7 (week-ends exclus)
        twice_daily → fractions / 10 × 7
        weekly      → fractions × 7
        custom      → total_duration_days déclaré
        """
        n = self.number_of_fractions or 0
        if self.fraction_interval == self.FractionInterval.DAILY:
            weeks = -(-n // 5)          # ceil division
            return weeks * 7
        if self.fraction_interval == self.FractionInterval.TWICE_DAILY:
            weeks = -(-n // 10)
            return weeks * 7
        if self.fraction_interval == self.FractionInterval.WEEKLY:
            return n * 7
        return self.total_duration_days


class ProtocolChangeLog(models.Model):
    """
    Trace chaque action sur un TreatmentProtocol :
    created / submitted / approved / rejected / archived / cloned.
    """
    protocol      = models.ForeignKey(
        TreatmentProtocol,
        on_delete=models.CASCADE,
        related_name="changelog",
    )
    action        = models.CharField(max_length=50)   # ex. "approved"
    performed_by  = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="protocol_actions",
    )
    changes       = models.JSONField(default=dict, blank=True)
    comment       = models.TextField(blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Journal protocole"

    def __str__(self):
        return f"{self.action} — {self.protocol}"


class DoseDeviation(models.Model):
    """
    Écart entre la dose prévue par le protocole et la dose réellement
    délivrée sur une session. Créé automatiquement par le viewset
    TreatmentSession quand abs(délivrée − attendue) > seuil.
    """
    class Severity(models.TextChoices):
        LOW      = "low",      "Faible (< 5%)"
        MODERATE = "moderate", "Modéré (5–10%)"
        HIGH     = "high",     "Élevé (> 10%)"

    session           = models.OneToOneField(
        TreatmentSession,
        on_delete=models.CASCADE,
        related_name="dose_deviation",
    )
    protocol          = models.ForeignKey(
        TreatmentProtocol,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="deviations",
    )
    expected_dose_gy  = models.DecimalField(max_digits=6, decimal_places=2)
    delivered_dose_gy = models.DecimalField(max_digits=6, decimal_places=2)
    deviation_pct     = models.DecimalField(max_digits=5, decimal_places=2)
    severity          = models.CharField(
        max_length=20,
        choices=Severity.choices,
        default=Severity.LOW,
    )
    notes             = models.TextField(blank=True)
    reviewed          = models.BooleanField(default=False)
    reviewed_by       = models.ForeignKey(
        User, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="deviations_reviewed",
    )
    reviewed_at       = models.DateTimeField(null=True, blank=True)
    created_at        = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Écart de dose"
        verbose_name_plural = "Écarts de dose"

    def __str__(self):
        return f"Écart {self.deviation_pct}% — session #{self.session_id}"

    @classmethod
    def classify_severity(cls, pct: float) -> str:
        pct = abs(pct)
        if pct < 5:
            return cls.Severity.LOW
        if pct <= 10:
            return cls.Severity.MODERATE
        return cls.Severity.HIGH