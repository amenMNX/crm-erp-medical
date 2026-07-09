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