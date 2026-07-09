from django.core.management.base import BaseCommand

from apps.accounting.models import Invoice, Payment
from apps.crm.models import Patient, TreatmentPlan, TreatmentSession
from apps.hr.models import Employee


class Command(BaseCommand):
    help = "Run a quick smoke test against core backend data."

    def handle(self, *args, **options):
        checks = {
            "patients": Patient.objects.exists(),
            "treatment_plans": TreatmentPlan.objects.exists(),
            "treatment_sessions": TreatmentSession.objects.exists(),
            "invoices": Invoice.objects.exists(),
            "payments": Payment.objects.exists(),
            "employees": Employee.objects.exists(),
        }

        failed = [name for name, passed in checks.items() if not passed]

        if failed:
            self.stdout.write(self.style.ERROR("Smoke test failed. Missing:"))
            for name in failed:
                self.stdout.write(f"- {name}")
            return

        self.stdout.write(self.style.SUCCESS("Smoke test passed."))
        self.stdout.write(f"Patients: {Patient.objects.count()}")
        self.stdout.write(f"Treatment plans: {TreatmentPlan.objects.count()}")
        self.stdout.write(f"Treatment sessions: {TreatmentSession.objects.count()}")
        self.stdout.write(f"Invoices: {Invoice.objects.count()}")
        self.stdout.write(f"Payments: {Payment.objects.count()}")
        self.stdout.write(f"Employees: {Employee.objects.count()}")