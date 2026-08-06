from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.crm.models import Patient, TreatmentPlan
from .models import Invoice, Payment


class InvoiceApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="accountant",
            password="testpass123",
            is_staff=True,
        )
        self.user.profile.role = "accountant"
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            first_name="Ali",
            last_name="Mansouri",
            cin="12345678",
            phone="22123456",
            email="ali@example.com",
            birth_date="1995-04-10",
            address="Tunis",
            medical_record_number="MR-0001",
            diagnosis="Test diagnosis",
            notes="First test patient",
        )
        self.treatment_plan = TreatmentPlan.objects.create(
            patient=self.patient,
            name="Radiotherapy Plan A",
            total_sessions=30,
            dose_per_session="2.00",
            total_dose="60.00",
            status="active",
        )
        self.invoice_data = {
            "patient": self.patient.id,
            "treatment_plan": self.treatment_plan.id,
            "issue_date": "2026-07-20",
            "due_date": "2026-08-20",
            "status": "issued",
            "line_items": [
                {
                    "description": "Radiotherapy session package",
                    "quantity": "1.00",
                    "unit_price": "1000.00",
                    "tax_rate": "19.00",
                }
            ],
            "notes": "Initial invoice",
        }

    def test_create_invoice(self):
        response = self.client.post("/api/accounting/invoices/", self.invoice_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(response.data["invoice_number"], "IN-0001")
        self.assertEqual(response.data["paid_amount"], "0.00")
        self.assertEqual(response.data["balance_due"], "1190.00")

    def test_list_invoices(self):
        Invoice.objects.create(
            patient=self.patient,
            treatment_plan=self.treatment_plan,
            invoice_number="IN-0001",
            issue_date="2026-07-20",
            due_date="2026-08-20",
            status="issued",
            subtotal="1000.00",
            tax_amount="190.00",
            total_amount="1190.00",
            notes="Initial invoice",
        )

        response = self.client.get("/api/accounting/invoices/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_filter_invoices_by_status(self):
        Invoice.objects.create(
            patient=self.patient,
            treatment_plan=self.treatment_plan,
            invoice_number="IN-0001",
            issue_date="2026-07-20",
            due_date="2026-08-20",
            status="paid",
            subtotal="1000.00",
            tax_amount="190.00",
            total_amount="1190.00",
        )

        response = self.client.get("/api/accounting/invoices/?status=paid")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], "paid")
        
class PaymentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="accountant_payment",
            password="testpass123",
            is_staff=True,
        )
        self.user.profile.role = "accountant"
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            first_name="Ali",
            last_name="Mansouri",
            cin="22334455",
            phone="22123456",
            email="ali.payment@example.com",
            birth_date="1995-04-10",
            address="Tunis",
            medical_record_number="MR-PAY-0001",
            diagnosis="Test diagnosis",
            notes="Payment test patient",
        )
        self.treatment_plan = TreatmentPlan.objects.create(
            patient=self.patient,
            name="Radiotherapy Plan Payment",
            total_sessions=30,
            dose_per_session="2.00",
            total_dose="60.00",
            status="active",
        )
        self.invoice = Invoice.objects.create(
            patient=self.patient,
            treatment_plan=self.treatment_plan,
            invoice_number="INV-PAY-0001",
            issue_date="2026-07-20",
            due_date="2026-08-20",
            status="issued",
            subtotal="1000.00",
            tax_amount="190.00",
            total_amount="1190.00",
        )
        self.payment_data = {
            "invoice": self.invoice.id,
            "payment_number": "PAY-0001",
            "payment_date": "2026-07-25",
            "amount": "500.00",
            "method": "cash",
            "reference": "REF-001",
            "notes": "First partial payment",
        }

    def test_create_payment(self):
        response = self.client.post("/api/accounting/payments/", self.payment_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(response.data["payment_number"], "PAY-0001")

    def test_list_payments(self):
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-0001",
            payment_date="2026-07-25",
            amount="500.00",
            method="cash",
            reference="REF-001",
            notes="First partial payment",
        )

        response = self.client.get("/api/accounting/payments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_filter_payments_by_method(self):
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-0001",
            payment_date="2026-07-25",
            amount="500.00",
            method="cash",
            reference="REF-001",
        )

        response = self.client.get("/api/accounting/payments/?method=cash")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["method"], "cash")

    def test_partial_payment_keeps_invoice_issued(self):
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-0001",
            payment_date="2026-07-25",
            amount="500.00",
            method="cash",
        )

        self.invoice.refresh_from_db()

        self.assertEqual(self.invoice.status, "issued")
        self.assertEqual(self.invoice.paid_amount, 500)
        self.assertEqual(self.invoice.balance_due, 690)

    def test_full_payment_marks_invoice_paid(self):
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-0001",
            payment_date="2026-07-25",
            amount="1190.00",
            method="cash",
        )

        self.invoice.refresh_from_db()

        self.assertEqual(self.invoice.status, "paid")
        self.assertEqual(self.invoice.paid_amount, 1190)
        self.assertEqual(self.invoice.balance_due, 0)

    def test_deleting_payment_reopens_paid_invoice(self):
        payment = Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-0001",
            payment_date="2026-07-25",
            amount="1190.00",
            method="cash",
        )
        payment.delete()

        self.invoice.refresh_from_db()

        self.assertEqual(self.invoice.status, "issued")
        self.assertEqual(self.invoice.paid_amount, 0)
        self.assertEqual(self.invoice.balance_due, 1190)
        
class AccountingPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.patient = Patient.objects.create(
            first_name="Ali",
            last_name="Mansouri",
            cin="ACC-PERM-001",
            phone="22123456",
            email="acc.perm@example.com",
            birth_date="1995-04-10",
            address="Tunis",
            medical_record_number="MR-ACC-PERM-001",
            diagnosis="Permission test",
            notes="Permission test patient",
        )

        self.invoice_data = {
            "patient": self.patient.id,
            "invoice_number": "INV-PERM-0001",
            "issue_date": "2026-07-20",
            "status": "issued",
            "subtotal": "1000.00",
            "tax_amount": "190.00",
            "total_amount": "1190.00",
        }

    def test_secretary_cannot_create_invoice(self):
        user = User.objects.create_user(
            username="secretary_user",
            password="testpass123",
        )
        user.profile.role = "secretary"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/accounting/invoices/", self.invoice_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_accountant_can_create_invoice(self):
        user = User.objects.create_user(
            username="accountant_user",
            password="testpass123",
        )
        user.profile.role = "accountant"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/accounting/invoices/", self.invoice_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
