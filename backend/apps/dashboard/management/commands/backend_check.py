from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run backend readiness checks."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Running system check..."))
        call_command("check")

        self.stdout.write(self.style.WARNING("Running tests..."))
        call_command("test")

        self.stdout.write(self.style.WARNING("Applying migrations..."))
        call_command("migrate", interactive=False)

        self.stdout.write(self.style.WARNING("Seeding demo data..."))
        call_command("seed_demo", reset=True)

        self.stdout.write(self.style.WARNING("Running smoke test..."))
        call_command("smoke_test")

        self.stdout.write(self.style.SUCCESS("Backend is ready."))