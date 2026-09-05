# apps/hr/management/commands/send_birthday_alerts.py

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Q
from datetime import timedelta
from apps.hr.models import Employee
from apps.messaging.models import Notification
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = "Creates notifications for HR & admins about upcoming employee birthdays"

    def handle(self, *args, **options):
        today = timezone.now().date()
        # Target today and tomorrow
        check_dates = [today, today + timedelta(days=1)]

        # Get all users with HR, admin, or superadmin privileges
        recipients = User.objects.filter(
            Q(profile__role__in=["hr", "admin"]) | Q(is_superuser=True)
        ).distinct()

        if not recipients.exists():
            self.stdout.write("No HR/admin users found. Exiting.")
            return

        created_count = 0

        for target_date in check_dates:
            # Active employees whose month/day match target_date
            employees = Employee.objects.filter(
                is_active=True,
                date_naissance__month=target_date.month,
                date_naissance__day=target_date.day,
            )

            for emp in employees:
                if target_date == today:
                    title = f"🎂 Birthday Today: {emp.first_name} {emp.last_name}"
                    body = (
                        f"{emp.first_name} is celebrating their birthday today! 🎉\n"
                        f"Department: {emp.department or 'N/A'}"
                    )
                    level = Notification.Level.SUCCESS  # or INFO
                else:
                    title = f"📅 Birthday Tomorrow: {emp.first_name} {emp.last_name}"
                    body = (
                        f"Don't forget! {emp.first_name}'s birthday is tomorrow.\n"
                        f"Department: {emp.department or 'N/A'}"
                    )
                    level = Notification.Level.INFO

                # Avoid duplicates: only create one notification per employee per day per recipient
                for user in recipients:
                    # Check if we already sent this exact notification today
                    existing = Notification.objects.filter(
                        recipient=user,
                        title=title,
                        created_at__date=today,
                    ).exists()

                    if not existing:
                        Notification.objects.create(
                            recipient=user,
                            title=title,
                            body=body,
                            level=level,
                            # is_read defaults to False
                        )
                        created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Birthday alerts sent: {created_count} notification(s) created."
            )
        )