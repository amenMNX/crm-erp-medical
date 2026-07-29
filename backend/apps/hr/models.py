from django.conf import settings
from django.db import models


class Employee(models.Model):
    class ContractType(models.TextChoices):
        CDI = "cdi", "CDI"
        CDD = "cdd", "CDD"
        INTERN = "intern", "Intern"
        CONSULTANT = "consultant", "Consultant"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="employee_profile",
        blank=True,
        null=True,
    )
    employee_number = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_naissance = models.DateField(blank=True, null=True)
    job_title = models.CharField(max_length=100)
    department = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    hire_date = models.DateField(blank=True, null=True)
    contract_type = models.CharField(
        max_length=20,
        choices=ContractType.choices,
        default=ContractType.CDI,
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class LeaveRequest(models.Model):
    
    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        ACCEPTEE = "Acceptée", "Acceptée"
        REFUSEE = "Refusée", "Refusée"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    date_debut = models.DateField()
    date_fin = models.DateField()
    motif = models.CharField(max_length=255, blank=True)
    statut = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.EN_ATTENTE,
    )
    notes = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="approved_leave_requests",
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} ({self.date_debut} - {self.date_fin})"


class Absence(models.Model):
    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="absences",
    )
    date = models.DateField()
    motif = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.employee} - {self.date}"


class SalaryAdvance(models.Model):

    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        APPROUVEE = "Approuvée", "Approuvée"
        REFUSEE = "Refusée", "Refusée"
        REMBOURSEE = "Remboursée", "Remboursée"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="salary_advances",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    request_date = models.DateField()
    reason = models.CharField(max_length=255, blank=True)
    statut = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.EN_ATTENTE,
    )
    repayment_date = models.DateField(blank=True, null=True)
    amount_repaid = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="approved_salary_advances",
        blank=True,
        null=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} - {self.amount} ({self.statut})"

class Shift(models.Model):
    class Status(models.TextChoices):
        PLANNED = "planned", "Planned"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="shifts",
    )
    title = models.CharField(max_length=150)
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    location = models.CharField(max_length=120, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLANNED,
    )
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_datetime"]

    def __str__(self):
        return f"{self.employee} - {self.title}"