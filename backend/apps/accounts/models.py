from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        DOCTOR = "doctor", "Doctor"
        RADIOTHERAPIST = "radiotherapist", "Radiotherapist"
        SECRETARY = "secretary", "Secretary"
        ACCOUNTANT = "accountant", "Accountant"
        HR = "hr", "HR"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.SECRETARY,
    )
    phone = models.CharField(max_length=30, blank=True)
    department = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.user.username} - {self.role}"