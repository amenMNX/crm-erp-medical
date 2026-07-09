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