# apps/hr/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone
from apps.accounts.models import RolePermission


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
    leave_credit_days = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        default=30,
        help_text="Annual leave credit in days",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    
    role = models.ForeignKey(
        RolePermission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
        help_text="The role this employee has for permissions",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    def leave_days_used(self, year=None):
        year = year or timezone.now().year
        year_start = timezone.datetime(year, 1, 1).date()
        year_end = timezone.datetime(year, 12, 31).date()
        total = 0

        accepted = self.leave_requests.filter(
            statut=LeaveRequest.Status.ACCEPTEE,
            date_debut__lte=year_end,
            date_fin__gte=year_start,
        )
        for leave in accepted:
            start = max(leave.date_debut, year_start)
            end = min(leave.date_fin, year_end)
            total += max((end - start).days + 1, 0)

        return total

    @property
    def leave_days_used_this_year(self):
        return self.leave_days_used()

    @property
    def leave_days_remaining_this_year(self):
        return max(float(self.leave_credit_days) - self.leave_days_used_this_year, 0)
    
    @staticmethod
    def normalize_role_name(job_title):
        """Normalize job title to Title Case (e.g., 'Senior Developer')."""
        if not job_title:
            return ""
        
        job_title = job_title.strip()
        
        special_cases = {
            "CEO": "CEO",
            "CFO": "CFO",
            "CTO": "CTO",
            "COO": "COO",
            "HR": "HR",
            "IT": "IT",
            "UI/UX": "UI/UX",
            "UX/UI": "UX/UI",
        }
        
        # Check if the entire job title is a special case
        if job_title.upper() in special_cases:
            return special_cases[job_title.upper()]
        
        # Split by spaces and capitalize each word
        words = job_title.split()
        title_case_words = []
        
        for word in words:
            # Check if word is a special case
            if word.upper() in special_cases:
                title_case_words.append(special_cases[word.upper()])
            else:
                # Capitalize first letter, make rest lowercase
                title_case_words.append(word.capitalize())
        
        return " ".join(title_case_words)

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

    @property
    def duration_days(self):
        return max((self.date_fin - self.date_debut).days + 1, 0)


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

# ─── US-RH-01 : Compétences & Formations ────────────────────────────────────

class Skill(models.Model):
    """Référentiel des compétences disponibles dans l'établissement."""

    class Category(models.TextChoices):
        CLINICAL    = "clinical",    "Clinique"
        TECHNICAL   = "technical",   "Technique"
        REGULATORY  = "regulatory",  "Réglementaire / Sécurité"
        MANAGEMENT  = "management",  "Management"
        OTHER       = "other",       "Autre"

    name        = models.CharField(max_length=150, unique=True)
    category    = models.CharField(max_length=30, choices=Category.choices, default=Category.CLINICAL)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category", "name"]
        verbose_name = "Compétence"
        verbose_name_plural = "Compétences"

    def __str__(self):
        return f"{self.name} ({self.get_category_display()})"


class EmployeeSkill(models.Model):
    """Association compétence ↔ employé avec niveau de maîtrise."""

    class Level(models.TextChoices):
        BEGINNER     = "beginner",     "Débutant"
        INTERMEDIATE = "intermediate", "Intermédiaire"
        ADVANCED     = "advanced",     "Avancé"
        EXPERT       = "expert",       "Expert"

    employee     = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="skills")
    skill        = models.ForeignKey(Skill, on_delete=models.CASCADE, related_name="employee_skills")
    level        = models.CharField(max_length=20, choices=Level.choices, default=Level.INTERMEDIATE)
    acquired_date = models.DateField(blank=True, null=True)
    notes        = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("employee", "skill")]
        ordering = ["skill__category", "skill__name"]
        verbose_name = "Compétence employé"
        verbose_name_plural = "Compétences employés"

    def __str__(self):
        return f"{self.employee} — {self.skill.name} ({self.get_level_display()})"


class TrainingSession(models.Model):
    """Session de formation planifiée ou réalisée."""

    class Status(models.TextChoices):
        PLANNED   = "planned",   "Planifiée"
        ONGOING   = "ongoing",   "En cours"
        COMPLETED = "completed", "Terminée"
        CANCELLED = "cancelled", "Annulée"

    title        = models.CharField(max_length=200)
    skill        = models.ForeignKey(Skill, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name="training_sessions",
                                     help_text="Compétence visée par cette formation")
    description  = models.TextField(blank=True)
    trainer      = models.CharField(max_length=200, blank=True, help_text="Formateur interne ou organisme externe")
    location     = models.CharField(max_length=200, blank=True)
    start_date   = models.DateField()
    end_date     = models.DateField()
    duration_hours = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    status       = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    max_participants = models.PositiveIntegerField(default=0, help_text="0 = illimité")
    cost         = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes        = models.TextField(blank=True)

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)
    created_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="training_sessions_created"
    )

    class Meta:
        ordering = ["-start_date"]
        verbose_name = "Session de formation"
        verbose_name_plural = "Sessions de formation"

    def __str__(self):
        return f"{self.title} ({self.start_date})"


class TrainingEnrollment(models.Model):
    """Inscription d'un employé à une session de formation + résultat."""

    class Result(models.TextChoices):
        PENDING = "pending", "En attente"
        PASSED  = "passed",  "Réussi"
        FAILED  = "failed",  "Échoué"
        ABSENT  = "absent",  "Absent"

    session    = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="enrollments")
    employee   = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="training_enrollments")
    result     = models.CharField(max_length=20, choices=Result.choices, default=Result.PENDING)
    score      = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                     help_text="Note obtenue (sur 100)")
    certificate_issued = models.BooleanField(default=False)
    notes      = models.TextField(blank=True)

    enrolled_at = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("session", "employee")]
        ordering = ["session__start_date", "employee__last_name"]
        verbose_name = "Inscription à une formation"
        verbose_name_plural = "Inscriptions aux formations"

    def __str__(self):
        return f"{self.employee} → {self.session.title} ({self.get_result_display()})"
