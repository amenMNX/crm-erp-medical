from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.crm.models import Appointment, Patient, TreatmentPlan, TreatmentSession
from apps.accounting.models import Invoice, Payment


class DashboardSummaryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="dashboard_user",
            password="testpass123",
        )
        self.user.profile.role = "admin"
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
        Appointment.objects.create(
            patient=self.patient,
            title="Consultation",
            appointment_date="2026-07-10T09:00:00Z",
            status="scheduled",
        )
        TreatmentSession.objects.create(
            patient=self.patient,
            treatment_plan=self.treatment_plan,
            session_number=1,
            scheduled_datetime="2026-07-16T09:00:00Z",
            status="completed",
            dose_delivered="2.00",
        )
        self.invoice = Invoice.objects.create(
            patient=self.patient,
            treatment_plan=self.treatment_plan,
            invoice_number="INV-DASH-0001",
            issue_date="2026-07-20",
            due_date="2026-08-20",
            status="issued",
            subtotal="1000.00",
            tax_amount="190.00",
            total_amount="1190.00",
        )

        Payment.objects.create(
            invoice=self.invoice,
            payment_number="PAY-DASH-0001",
            payment_date="2026-07-25",
            amount="500.00",
            method="cash",
        )
        
    def test_dashboard_summary_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/dashboard/summary/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    def test_dashboard_summary(self):
        response = self.client.get("/api/dashboard/summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["patients_count"], 1)
        self.assertEqual(response.data["appointments_count"], 1)
        self.assertEqual(response.data["treatment_plans_count"], 1)
        self.assertEqual(response.data["treatment_sessions_count"], 1)
        self.assertEqual(response.data["completed_sessions_count"], 1)
        self.assertEqual(response.data["active_treatment_plans_count"], 1)
        self.assertEqual(response.data["invoices_count"], 1)
        self.assertEqual(response.data["payments_count"], 1)
        self.assertEqual(response.data["paid_invoices_count"], 0)
        self.assertEqual(response.data["unpaid_invoices_count"], 1)
        self.assertEqual(response.data["invoiced_total"], "1190")
        self.assertEqual(response.data["paid_total"], "500")
        self.assertEqual(response.data["unpaid_total"], "690")
    
class ApiDocsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_api_docs(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["service"], "crm-erp-radiotherapy")
        self.assertIn("modules", response.data)
        self.assertIn("crm", response.data["modules"])
        self.assertIn("patients", response.data["modules"]["crm"])
        self.assertEqual(
            response.data["modules"]["crm"]["patients"],
            "/api/crm/patients/",
        )
    
    def test_api_docs_contains_auth_endpoints(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["modules"]["accounts"]["login"],
            "/api/accounts/login/",
        )
        self.assertEqual(
            response.data["modules"]["accounts"]["logout"],
            "/api/accounts/logout/",
        )
    
    def test_api_docs_contains_roles_and_permissions(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("roles", response.data)
        self.assertIn("admin", response.data["roles"])
        self.assertIn("doctor", response.data["roles"])
        self.assertIn("accountant", response.data["roles"])

        self.assertIn("permissions", response.data)
        self.assertEqual(
            response.data["permissions"]["crm"]["write"],
            ["admin", "doctor", "secretary"],
        )
        self.assertEqual(
            response.data["permissions"]["accounting"]["write"],
            ["admin", "accountant"],
        )

class HealthCheckTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_check(self):
        response = self.client.get("/api/dashboard/health/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["service"], "crm-erp-radiotherapy")
        
        
class ApiDocsPublicTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_api_docs_is_public(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_api_docs_contains_all_modules(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("accounts", response.data["modules"])
        self.assertIn("crm", response.data["modules"])
        self.assertIn("hr", response.data["modules"])
        self.assertIn("accounting", response.data["modules"])
        self.assertIn("dashboard", response.data["modules"])
        
    def test_api_docs_contains_auth_endpoints(self):
        response = self.client.get("/api/dashboard/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["modules"]["accounts"]["login"],
            "/api/accounts/login/",
        )
        self.assertEqual(
            response.data["modules"]["accounts"]["logout"],
            "/api/accounts/logout/",
        )
        self.assertEqual(
            response.data["modules"]["accounts"]["change_password"],
            "/api/accounts/change-password/",
        )