from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from apps.accounting.models import Invoice, Payment
from apps.crm.models import Patient, TreatmentPlan, TreatmentSession
from apps.hr.models import Employee


class Command(BaseCommand):
    help = "Seed demo data for local development."
    
    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before seeding.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            Payment.objects.filter(payment_number__startswith="PAY-DEMO").delete()
            Invoice.objects.filter(invoice_number__startswith="INV-DEMO").delete()
            TreatmentSession.objects.filter(treatment_plan__name__startswith="Demo").delete()
            TreatmentPlan.objects.filter(name__startswith="Demo").delete()
            Patient.objects.filter(medical_record_number__startswith="MR-DEMO").delete()
            Employee.objects.filter(employee_number__startswith="EMP-DEMO").delete()
            User.objects.filter(username="admin").delete()
            self.stdout.write(self.style.WARNING("Existing demo data deleted."))
            
        admin, _ = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@example.com",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        admin.set_password("admin123")
        admin.save()

        patient, _ = Patient.objects.get_or_create(
            medical_record_number="MR-DEMO-0001",
            defaults={
                "first_name": "Ali",
                "last_name": "Mansouri",
                "cin": "DEMO123456",
                "phone": "22123456",
                "email": "ali.demo@example.com",
                "birth_date": "1995-04-10",
                "address": "Tunis",
                "diagnosis": "Demo diagnosis",
            },
        )

        plan, _ = TreatmentPlan.objects.get_or_create(
            patient=patient,
            name="Demo Radiotherapy Plan",
            defaults={
                "diagnosis": "Demo diagnosis",
                "protocol": "Standard fractionated radiotherapy",
                "total_sessions": 30,
                "dose_per_session": Decimal("2.00"),
                "total_dose": Decimal("60.00"),
                "start_date": "2026-07-15",
                "status": "active",
            },
        )

        TreatmentSession.objects.get_or_create(
            treatment_plan=plan,
            session_number=1,
            defaults={
                "patient": patient,
                "scheduled_datetime": "2026-07-16T09:00:00Z",
                "status": "scheduled",
                "machine": "LINAC 1",
                "room": "Room A",
                "dose_delivered": Decimal("0.00"),
            },
        )

        invoice, _ = Invoice.objects.get_or_create(
            invoice_number="INV-DEMO-0001",
            defaults={
                "patient": patient,
                "treatment_plan": plan,
                "issue_date": "2026-07-20",
                "due_date": "2026-08-20",
                "status": "issued",
                "subtotal": Decimal("1000.00"),
                "tax_amount": Decimal("190.00"),
                "total_amount": Decimal("1190.00"),
            },
        )

        Payment.objects.get_or_create(
            payment_number="PAY-DEMO-0001",
            defaults={
                "invoice": invoice,
                "payment_date": "2026-07-25",
                "amount": Decimal("500.00"),
                "method": "cash",
                "reference": "DEMO",
            },
        )

        Employee.objects.get_or_create(
            employee_number="EMP-DEMO-0001",
            defaults={
                "first_name": "Nadia",
                "last_name": "Karoui",
                "job_title": "Radiotherapist",
                "department": "Radiotherapy",
                "email": "nadia@example.com",
                "phone": "22111222",
                "hire_date": "2026-01-15",
                "contract_type": "cdi",
            },
        )

        self.stdout.write(self.style.SUCCESS("Demo data seeded successfully."))
        self.stdout.write("Admin login: admin / admin123")