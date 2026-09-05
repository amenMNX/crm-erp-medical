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


class CnamSplitInvoiceTests(TestCase):
    """Tests for CNAM split (patient_share / cnam_share) and APCI logic."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="acc_cnam", password="testpass", is_staff=True)
        user.profile.role = "accountant"
        user.profile.save()
        self.client.force_authenticate(user=user)

        self.patient = Patient.objects.create(
            first_name="Sonia",
            last_name="Trabelsi",
            cin="CNAM-TEST-01",
            phone="22000001",
            email="sonia@example.com",
            birth_date="1980-06-15",
            address="Sousse",
            medical_record_number="MR-CNAM-0001",
            cnam_scheme="tiers_payant",
            cnam_affiliation_number="CNSS-123456",
        )
        self.plan = TreatmentPlan.objects.create(
            patient=self.patient,
            name="Plan CNAM A",
            total_sessions=10,
            dose_per_session="2.00",
            total_dose="20.00",
            status="active",
        )
        # Base invoice: total 1 000 TND, patient pays 30 % ticket, CNAM pays 70 %.
        self.invoice = Invoice.objects.create(
            patient=self.patient,
            treatment_plan=self.plan,
            invoice_number="IN-CNAM-0001",
            issue_date="2026-08-01",
            due_date="2026-09-01",
            status="issued",
            subtotal="1000.000",
            tax_amount="0.000",
            total_amount="1000.000",
            patient_share="300.000",
            cnam_share="700.000",
        )

    # ── balance_due ───────────────────────────────────────────────────────────

    def test_balance_due_uses_patient_share_when_split_set(self):
        """With a CNAM split, the patient only owes patient_share, not total_amount."""
        self.assertEqual(self.invoice.balance_due, 300)

    def test_balance_due_uses_total_when_no_split(self):
        """Without a CNAM split, the patient owes the full total."""
        invoice = Invoice.objects.create(
            patient=self.patient,
            invoice_number="IN-NOSPLIT-0001",
            issue_date="2026-08-01",
            status="issued",
            subtotal="500.000",
            tax_amount="0.000",
            total_amount="500.000",
        )
        self.assertEqual(invoice.balance_due, 500)

    # ── refresh_payment_status ────────────────────────────────────────────────

    def test_paying_patient_share_marks_invoice_paid(self):
        """Invoice is PAID once the patient's share is fully received."""
        from apps.accounting.models import Payment
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-CNAM-0001",
            payment_date="2026-08-10",
            amount="300.000",
            method="cash",
        )
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "paid")

    def test_partial_patient_payment_keeps_invoice_issued(self):
        """Paying less than patient_share keeps the invoice as issued."""
        from apps.accounting.models import Payment
        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-CNAM-0002",
            payment_date="2026-08-10",
            amount="150.000",
            method="cash",
        )
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, "issued")
        self.assertEqual(self.invoice.balance_due, 150)

    # ── API: create with split ────────────────────────────────────────────────

    def test_create_invoice_with_cnam_split_via_api(self):
        """API accepts patient_share and cnam_share on invoice creation."""
        payload = {
            "patient": self.patient.id,
            "issue_date": "2026-08-15",
            "due_date": "2026-09-15",
            "status": "issued",
            "patient_share": "90.000",
            "cnam_share": "210.000",
            "line_items": [
                {"description": "Consultation oncologie", "quantity": "1.00", "unit_price": "300.000", "tax_rate": "0.00"},
            ],
        }
        response = self.client.post("/api/accounting/invoices/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["patient_share"], "90.000")
        self.assertEqual(response.data["cnam_share"], "210.000")
        self.assertEqual(response.data["balance_due"], "90.000")

    def test_api_exposes_patient_cnam_scheme(self):
        """Invoice response includes the patient's CNAM scheme."""
        response = self.client.get(f"/api/accounting/invoices/{self.invoice.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["patient_cnam_scheme"], "tiers_payant")
        self.assertEqual(response.data["patient_cnam_scheme_display"], "Tiers payant (médecin traitant)")

    # ── APCI ─────────────────────────────────────────────────────────────────

    def test_apci_invoice_has_zero_patient_share(self):
        """An APCI invoice must have patient_share = 0."""
        invoice = Invoice.objects.create(
            patient=self.patient,
            invoice_number="IN-APCI-0001",
            issue_date="2026-08-01",
            status="issued",
            subtotal="5000.000",
            tax_amount="0.000",
            total_amount="5000.000",
            patient_share="0.000",
            cnam_share="5000.000",
            is_apci=True,
        )
        self.assertTrue(invoice.is_apci)
        self.assertEqual(invoice.patient_share, 0)
        self.assertEqual(invoice.balance_due, 0)

    def test_api_rejects_apci_with_nonzero_patient_share(self):
        """The API must reject is_apci=True combined with a non-zero patient_share."""
        payload = {
            "patient": self.patient.id,
            "issue_date": "2026-08-15",
            "status": "issued",
            "patient_share": "100.000",
            "cnam_share": "900.000",
            "is_apci": True,
            "line_items": [
                {"description": "Séance dialyse", "quantity": "1.00", "unit_price": "1000.000", "tax_rate": "0.00"},
            ],
        }
        response = self.client.post("/api/accounting/invoices/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("patient_share", response.data)


class CnamPatientFieldsTests(TestCase):
    """Tests for the new CNAM fields on Patient."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="admin_cnam", password="testpass", is_staff=True)
        user.profile.role = "admin"
        user.profile.save()
        self.client.force_authenticate(user=user)

    def test_patient_defaults_to_no_cnam_scheme(self):
        patient = Patient.objects.create(
            first_name="Amine",
            last_name="Jdidi",
            cin="NO-CNAM-001",
            medical_record_number="MR-NC-0001",
        )
        self.assertEqual(patient.cnam_scheme, "none")
        self.assertEqual(patient.cnam_affiliation_number, "")

    def test_create_patient_with_cnam_scheme_via_api(self):
        payload = {
            "first_name": "Rania",
            "last_name": "Chaouachi",
            "cin": "CNAM-API-001",
            "phone": "22000099",
            "email": "rania@example.com",
            "birth_date": "1990-03-20",
            "address": "Sfax",
            "cnam_scheme": "remboursement",
            "cnam_affiliation_number": "CNRPS-789012",
        }
        response = self.client.post("/api/crm/patients/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["cnam_scheme"], "remboursement")
        self.assertEqual(response.data["cnam_scheme_display"], "Filière remboursement")
        self.assertEqual(response.data["cnam_affiliation_number"], "CNRPS-789012")