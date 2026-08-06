from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError

class Machine(models.Model):
    """A radiotherapy machine (LINAC, CT-sim, etc.) available for treatment sessions."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        MAINTENANCE = "maintenance", "En maintenance"
        DECOMMISSIONED = "decommissioned", "Hors service"

    name = models.CharField(max_length=100, unique=True)
    model = models.CharField(max_length=100, blank=True, help_text="Manufacturer / model reference")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Room(models.Model):
    """A treatment or consultation room."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        MAINTENANCE = "maintenance", "En maintenance"
        CLOSED = "closed", "Fermée"

    name = models.CharField(max_length=100, unique=True)
    location = models.CharField(max_length=150, blank=True, help_text="Building / floor / wing")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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


class Patient(models.Model):
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