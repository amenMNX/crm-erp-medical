from django.conf import settings
from django.db import models

# Create your models here.
class Patient (models.Model):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    cin = models.CharField(max_length=20, unique=True, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    birth_date = models.DateField(blank=True, null=True)
    address = models.TextField(blank=True)

    medical_record_number = models.CharField(max_length=50, unique=True)
    diagnosis = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"
    
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
    machine = models.CharField(max_length=100, blank=True)
    room = models.CharField(max_length=100, blank=True)
    dose_delivered = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_datetime", "session_number"]
        unique_together = ("treatment_plan", "session_number")

    def __str__(self):
        return f"Session {self.session_number} - {self.patient}"


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
        last = Ticket.objects.order_by("-id").first()
        next_id = (last.id + 1) if last else 1
        candidate = f"TCK-{next_id:03d}"
        # Guard against gaps/deletions causing a collision.
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