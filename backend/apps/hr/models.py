# apps/hr/models.py
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from apps.accounts.models import RolePermission
import re


class Employee(models.Model):
    class ContractType(models.TextChoices):
        CDI        = "cdi",        "CDI"
        CDD        = "cdd",        "CDD"
        INTERN     = "intern",     "Intern"
        CONSULTANT = "consultant", "Consultant"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employee_profile",
    )
    role = models.ForeignKey(
        RolePermission,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="employees",
    )
    first_name      = models.CharField(max_length=100)
    last_name       = models.CharField(max_length=100)
    email           = models.EmailField(unique=True)
    phone           = models.CharField(max_length=30, blank=True)
    address         = models.TextField(blank=True)
    date_naissance  = models.DateField(blank=True, null=True)
    cin             = models.CharField(max_length=20, blank=True)
    cnam            = models.CharField(max_length=30, blank=True)
    department      = models.CharField(max_length=100, blank=True)
    position        = models.CharField(max_length=100, blank=True)
    contract_type   = models.CharField(max_length=20, choices=ContractType.choices, default=ContractType.CDI)
    hire_date       = models.DateField(null=True, blank=True)
    end_date        = models.DateField(null=True, blank=True)
    salary          = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active       = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)
    employee_number = models.CharField(max_length=50, unique=True, blank=True, null=True)
    job_title = models.CharField(max_length=100, blank=True)  # Or use position

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"
    @staticmethod
    def normalize_role_name(role_label: str) -> str:
        """
        Normalize a role name for consistent lookup in the database.
        - Strips leading/trailing whitespace
        - Converts to lowercase
        - Replaces spaces with underscores (optional, but recommended)
        
        Example: "HR Manager" → "hr_manager"
        """
        if not role_label:
            return ""
        # Clean and normalize
        normalized = role_label.strip().lower()
        # Replace spaces and special chars with underscores
        normalized = re.sub(r'[^a-z0-9]', '_', normalized)
        # Remove consecutive underscores
        normalized = re.sub(r'_+', '_', normalized)
        # Remove leading/trailing underscores
        return normalized.strip('_')


class LeaveRequest(models.Model):
    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        ACCEPTEE   = "Acceptée",   "Acceptée"
        REFUSEE    = "Refusée",    "Refusée"

    class LeaveType(models.TextChoices):
        ANNUEL   = "annuel",   "Congé annuel"
        MALADIE  = "maladie",  "Maladie"
        SANS_SOL = "sans_sol", "Sans solde"
        AUTRE    = "autre",    "Autre"

    employee   = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="leave_requests")
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices, default=LeaveType.ANNUEL)
    start_date = models.DateField()
    end_date   = models.DateField()
    reason     = models.TextField(blank=True)
    status     = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_ATTENTE)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_leaves")
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} — {self.leave_type} {self.start_date}"


class Absence(models.Model):
    class AbsenceType(models.TextChoices):
        MALADIE    = "maladie",    "Maladie"
        AUTORISEE  = "autorisee",  "Autorisée"
        RETARD     = "retard",     "Retard"
        INJUSTIFIE = "injustifie", "Injustifiée"

    employee     = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="absences")
    date         = models.DateField()
    absence_type = models.CharField(max_length=20, choices=AbsenceType.choices)
    justification= models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee} — {self.absence_type} {self.date}"


class SalaryAdvance(models.Model):
    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        APPROUVE   = "Approuvé",   "Approuvé"
        REFUSE     = "Refusé",     "Refusé"

    employee    = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="salary_advances")
    amount      = models.DecimalField(max_digits=10, decimal_places=2)
    reason      = models.TextField(blank=True)
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_ATTENTE)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_advances")
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.employee} — {self.amount} TND"


class Shift(models.Model):
    employee   = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="shifts")
    date       = models.DateField()
    start_time = models.TimeField()
    end_time   = models.TimeField()
    notes      = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee} — {self.date}"


class Skill(models.Model):
    name        = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class EmployeeSkill(models.Model):
    class Level(models.TextChoices):
        DEBUTANT     = "debutant",     "Débutant"
        INTERMEDIAIRE= "intermediaire","Intermédiaire"
        AVANCE       = "avance",       "Avancé"
        EXPERT       = "expert",       "Expert"

    employee  = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="skills")
    skill     = models.ForeignKey(Skill, on_delete=models.CASCADE, related_name="employee_skills")
    level     = models.CharField(max_length=20, choices=Level.choices, default=Level.DEBUTANT)
    notes     = models.TextField(blank=True)
    created_at= models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["employee", "skill"]

    def __str__(self):
        return f"{self.employee} — {self.skill} ({self.level})"


class TrainingSession(models.Model):
    class Status(models.TextChoices):
        PLANIFIE  = "planifie",  "Planifié"
        EN_COURS  = "en_cours",  "En cours"
        TERMINE   = "termine",   "Terminé"
        ANNULE    = "annule",    "Annulé"

    title        = models.CharField(max_length=200)
    description  = models.TextField(blank=True)
    trainer      = models.CharField(max_length=200, blank=True)
    location     = models.CharField(max_length=200, blank=True)
    start_date   = models.DateField()
    end_date     = models.DateField()
    status       = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANIFIE)
    participants = models.ManyToManyField(Employee, through="TrainingEnrollment", related_name="training_sessions", blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.title


class TrainingEnrollment(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="enrollments")
    session  = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="enrollments")
    enrolled_at   = models.DateTimeField(auto_now_add=True)
    completed     = models.BooleanField(default=False)
    certificate   = models.FileField(upload_to="certificates/", blank=True, null=True)

    class Meta:
        unique_together = ["employee", "session"]

    def __str__(self):
        return f"{self.employee} → {self.session}"


# ── S3: Document Requests ─────────────────────────────────────────────────────

class DocumentRequest(models.Model):
    class DocumentType(models.TextChoices):
        ATTESTATION_TRAVAIL = "attestation_travail", "Attestation de travail"
        CERTIFICAT_SALAIRE  = "certificat_salaire",  "Certificat de salaire"
        BULLETIN_PAIE       = "bulletin_paie",       "Copie bulletin de paie"
        SOLDE_TOUT_COMPTE   = "solde_tout_compte",   "Solde de tout compte"
        ATTESTATION_CONGE   = "attestation_conge",   "Attestation de congé"
        AUTRE               = "autre",               "Autre"

    class Status(models.TextChoices):
        EN_ATTENTE = "En attente", "En attente"
        EN_COURS   = "En cours",   "En cours"
        PRET       = "Prêt",       "Prêt"
        REFUSE     = "Refusé",     "Refusé"

    employee      = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="document_requests")
    document_type = models.CharField(max_length=50, choices=DocumentType.choices)
    motif         = models.CharField(max_length=255, blank=True)
    statut        = models.CharField(max_length=20, choices=Status.choices, default=Status.EN_ATTENTE)
    notes_rh      = models.TextField(blank=True, help_text="Notes internes RH (non visibles par l'employé)")
    handled_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="handled_document_requests")
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Demande de document"
        verbose_name_plural = "Demandes de documents"

    def __str__(self):
        return f"{self.employee} — {self.get_document_type_display()} ({self.statut})"


# ── S6: Recruitment ───────────────────────────────────────────────────────────

class JobPost(models.Model):
    class ContractType(models.TextChoices):
        CDI       = "cdi",       "CDI"
        CDD       = "cdd",       "CDD"
        INTERN    = "intern",    "Stage"
        FREELANCE = "freelance", "Freelance"
        TEMPORARY = "temporary", "Temporaire"

    class Status(models.TextChoices):
        DRAFT     = "draft",     "Brouillon"
        PUBLISHED = "published", "Publiée"
        CLOSED    = "closed",    "Fermée"
        CANCELLED = "cancelled", "Annulée"

    class ExperienceLevel(models.TextChoices):
        ENTRY  = "entry",  "Débutant (0-2 ans)"
        JUNIOR = "junior", "Junior (2-5 ans)"
        SENIOR = "senior", "Senior (5-10 ans)"
        EXPERT = "expert", "Expert (10+ ans)"

    title            = models.CharField(max_length=200)
    department       = models.CharField(max_length=100, blank=True)
    contract_type    = models.CharField(max_length=20, choices=ContractType.choices, default=ContractType.CDI)
    experience_level = models.CharField(max_length=20, choices=ExperienceLevel.choices, default=ExperienceLevel.JUNIOR)
    location         = models.CharField(max_length=200, blank=True)
    salary_range_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    salary_range_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description      = models.TextField()
    requirements     = models.TextField()
    benefits         = models.TextField(blank=True)
    responsibilities = models.TextField(blank=True)
    posted_at        = models.DateTimeField(null=True, blank=True)
    closing_date     = models.DateField(null=True, blank=True)
    start_date       = models.DateField(null=True, blank=True)
    status           = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    is_internal      = models.BooleanField(default=False)
    created_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="job_posts_created")
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Offre d'emploi"
        verbose_name_plural = "Offres d'emploi"

    def __str__(self):
        return f"{self.title} ({self.get_contract_type_display()})"

    @property
    def application_count(self):
        return self.applications.count()

    def publish(self, user):
        self.status   = self.Status.PUBLISHED
        self.posted_at = timezone.now()
        self.save()
        if self.is_internal:
            from apps.messaging.models import Notification
            for emp in Employee.objects.filter(is_active=True).exclude(user=None):
                Notification.objects.create(
                    recipient=emp.user,
                    title="Nouvelle offre interne",
                    body=f"Nouvelle offre disponible : {self.title}",
                )


class Application(models.Model):
    class Status(models.TextChoices):
        PENDING   = "pending",   "En attente"
        REVIEWING = "reviewing", "En cours d'examen"
        INTERVIEW = "interview", "Entretien"
        OFFER     = "offer",     "Offre proposée"
        ACCEPTED  = "accepted",  "Acceptée"
        REJECTED  = "rejected",  "Rejetée"
        WITHDRAWN = "withdrawn", "Retirée"

    class Source(models.TextChoices):
        INTERNAL = "internal", "Interne"
        REFERRAL = "referral", "Recommandation"
        EXTERNAL = "external", "Externe"
        OTHER    = "other",    "Autre"

    job_post    = models.ForeignKey(JobPost, on_delete=models.CASCADE, related_name="applications")
    candidate   = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="applications")
    referred_by = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name="referrals")
    status      = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    source      = models.CharField(max_length=20, choices=Source.choices, default=Source.EXTERNAL)
    first_name  = models.CharField(max_length=100)
    last_name   = models.CharField(max_length=100)
    email       = models.EmailField()
    phone       = models.CharField(max_length=30, blank=True)
    cover_letter_text = models.TextField(blank=True)
    rating      = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)
    interview_notes = models.TextField(blank=True)
    feedback    = models.TextField(blank=True)
    applied_at  = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    interview_date = models.DateTimeField(null=True, blank=True)
    offer_sent_at  = models.DateTimeField(null=True, blank=True)
    accepted_at    = models.DateTimeField(null=True, blank=True)
    rejected_at    = models.DateTimeField(null=True, blank=True)
    reviewed_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="applications_reviewed")
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-applied_at"]
        verbose_name = "Candidature"
        verbose_name_plural = "Candidatures"

    def __str__(self):
        return f"{self.first_name} {self.last_name} — {self.job_post.title}"

    def _notify_candidate(self, title, body):
        if self.candidate and self.candidate.user:
            from apps.messaging.models import Notification
            Notification.objects.create(recipient=self.candidate.user, title=title, body=body)

    def advance_to_interview(self, user, interview_date=None):
        self.status      = self.Status.INTERVIEW
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        if interview_date:
            self.interview_date = interview_date
        self.save()
        self._notify_candidate("Entretien programmé", f"Entretien pour : {self.job_post.title}")

    def send_offer(self, user):
        self.status       = self.Status.OFFER
        self.offer_sent_at = timezone.now()
        self.reviewed_by  = user
        self.save()
        self._notify_candidate("Offre d'emploi", f"Une offre vous a été faite pour : {self.job_post.title}")

    def accept(self, user):
        self.status     = self.Status.ACCEPTED
        self.accepted_at = timezone.now()
        self.save()
        self._notify_candidate("Candidature acceptée", f"Félicitations ! Votre candidature pour {self.job_post.title} a été acceptée.")

    def reject(self, user, reason=None):
        self.status      = self.Status.REJECTED
        self.rejected_at = timezone.now()
        self.reviewed_by = user
        if reason:
            self.feedback = reason
        self.save()
        self._notify_candidate("Candidature non retenue", f"Votre candidature pour {self.job_post.title} n'a pas été retenue.")


class RecruitmentComment(models.Model):
    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="comments")
    author      = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="recruitment_comments")
    content     = models.TextField()
    is_internal = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment on {self.application} by {self.author}"


# ── S7: Social Events & Motivations ──────────────────────────────────────────

class SocialEvent(models.Model):
    class EventType(models.TextChoices):
        TEAM_BUILDING = "team_building", "Team Building"
        ANNIVERSARY   = "anniversary",   "Anniversaire"
        MARRIAGE      = "marriage",      "Mariage"
        BIRTH         = "birth",         "Naissance"
        CIRCUMCISION  = "circumcision",  "Circoncision"
        BAC_SUCCESS   = "bac_success",   "Réussite Bac"
        PROMOTION     = "promotion",     "Promotion"
        RETIREMENT    = "retirement",    "Départ à la retraite"
        HOLIDAY       = "holiday",       "Fête"
        OTHER         = "other",         "Autre"

    class Status(models.TextChoices):
        PLANNED   = "planned",   "Planifié"
        ONGOING   = "ongoing",   "En cours"
        COMPLETED = "completed", "Terminé"
        CANCELLED = "cancelled", "Annulé"

    title            = models.CharField(max_length=200)
    event_type       = models.CharField(max_length=20, choices=EventType.choices, default=EventType.TEAM_BUILDING)
    description      = models.TextField(blank=True)
    event_date       = models.DateField()
    start_time       = models.TimeField(null=True, blank=True)
    end_time         = models.TimeField(null=True, blank=True)
    location         = models.CharField(max_length=200, blank=True)
    participants     = models.ManyToManyField(Employee, related_name="social_events", blank=True)
    max_participants = models.PositiveIntegerField(default=0, help_text="0 = illimité")
    organized_by     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="organized_events")
    budget           = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status           = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNED)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-event_date"]
        verbose_name = "Événement social"
        verbose_name_plural = "Événements sociaux"

    def __str__(self):
        return f"{self.get_event_type_display()} — {self.title} ({self.event_date})"

    @property
    def participant_count(self):
        return self.participants.count()

    @property
    def is_full(self):
        return self.max_participants > 0 and self.participant_count >= self.max_participants

    def register_participant(self, employee):
        if self.is_full:
            raise ValidationError("Cet événement est complet.")
        self.participants.add(employee)
        if employee.user:
            from apps.messaging.models import Notification
            Notification.objects.create(
                recipient=employee.user,
                title="Inscription à un événement",
                body=f"Vous êtes inscrit à : {self.title}",
            )

    def unregister_participant(self, employee):
        self.participants.remove(employee)


class SocialEventComment(models.Model):
    event      = models.ForeignKey(SocialEvent, on_delete=models.CASCADE, related_name="comments")
    author     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="social_comments")
    content    = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        verbose_name = "Commentaire social"

    def __str__(self):
        return f"Comment on {self.event} by {self.author}"


class EmployeeRecognition(models.Model):
    class RecognitionType(models.TextChoices):
        EMPLOYEE_OF_MONTH     = "employee_of_month",     "Employé du mois"
        EXCELLENT_PERFORMANCE = "excellent_performance", "Performance exceptionnelle"
        INNOVATION            = "innovation",            "Innovation"
        TEAMWORK              = "teamwork",              "Esprit d'équipe"
        OTHER                 = "other",                 "Autre"

    employee         = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="recognitions")
    awarded_by       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="awarded_recognitions")
    recognition_type = models.CharField(max_length=30, choices=RecognitionType.choices, default=RecognitionType.EMPLOYEE_OF_MONTH)
    title            = models.CharField(max_length=200)
    description      = models.TextField()
    awarded_at       = models.DateTimeField(auto_now_add=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-awarded_at"]
        verbose_name = "Reconnaissance"
        verbose_name_plural = "Reconnaissances"

    def __str__(self):
        return f"{self.employee} — {self.get_recognition_type_display()}"


class EmployeeBirthday(models.Model):
    employee    = models.OneToOneField(Employee, on_delete=models.CASCADE, related_name="birthday")
    birth_date  = models.DateField()
    notify_team = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Anniversaire d'employé"
        verbose_name_plural = "Anniversaires d'employés"

    def __str__(self):
        return f"{self.employee} — {self.birth_date}"

    @property
    def next_birthday(self):
        today    = timezone.now().date()
        birthday = self.birth_date.replace(year=today.year)
        if birthday < today:
            birthday = birthday.replace(year=today.year + 1)
        return birthday

    @property
    def age(self):
        today = timezone.now().date()
        return today.year - self.birth_date.year - (
            (today.month, today.day) < (self.birth_date.month, self.birth_date.day)
        )
