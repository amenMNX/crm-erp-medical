from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
# Create your tests here.
from .models import Appointment, Patient, TreatmentPlan, TreatmentSession
from django.contrib.auth.models import User
from django.contrib.auth.models import User
class PatientModelTestCase(TestCase):
    def setUp(self):
        self.client=APIClient()
        self.user = User.objects.create_user(
            username="tester",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.patient_data={
            "first_name": "Ali",
            "last_name": "Mansouri",
            "cin": "12345678",
            "phone": "22123456",
            "email": "ali@example.com",
            "birth_date": "1995-04-10",
            "address": "Tunis",
            "medical_record_number": "MR-0001",
            "diagnosis": "Test diagnosis",
            "notes": "First test patient",
        }
        
    def test_create_patient(self):
        response = self.client.post("/api/crm/patients/", self.patient_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Patient.objects.count(), 1)
        self.assertEqual(Patient.objects.first().medical_record_number, "MR-0001")

    def test_list_patients(self):
        Patient.objects.create(**self.patient_data)

        response = self.client.get("/api/crm/patients/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        
class AppointmentApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="tester",
            password="testpass123",
        )
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

    def test_create_appointment(self):
        data = {
            "patient": self.patient.id,
            "title": "Consultation initiale",
            "appointment_date": "2026-07-10T09:00:00Z",
            "status": "scheduled",
            "reason": "First consultation",
            "notes": "Bring medical files",
        }

        response = self.client.post("/api/crm/appointments/", data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Consultation initiale")
        self.assertEqual(response.data["patient"], self.patient.id)

    def test_list_appointments(self):
        self.patient.appointments.create(
            title="Consultation initiale",
            appointment_date="2026-07-10T09:00:00Z",
            status="scheduled",
            reason="First consultation",
            notes="Bring medical files",
        )

        response = self.client.get("/api/crm/appointments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

class TreatmentPlanApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="tester",
            password="testpass123",
        )
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

    def test_create_treatment_plan(self):
        data = {
            "patient": self.patient.id,
            "name": "Radiotherapy Plan A",
            "diagnosis": "Lung cancer",
            "protocol": "Standard fractionated radiotherapy",
            "total_sessions": 30,
            "dose_per_session": "2.00",
            "total_dose": "60.00",
            "start_date": "2026-07-15",
            "end_date": "2026-08-30",
            "status": "active",
            "notes": "Initial treatment plan",
        }

        response = self.client.post("/api/crm/treatment-plans/", data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Radiotherapy Plan A")
        self.assertEqual(response.data["patient"], self.patient.id)

    def test_list_treatment_plans(self):
        TreatmentPlan.objects.create(
            patient=self.patient,
            name="Radiotherapy Plan A",
            diagnosis="Lung cancer",
            protocol="Standard fractionated radiotherapy",
            total_sessions=30,
            dose_per_session="2.00",
            total_dose="60.00",
            start_date="2026-07-15",
            end_date="2026-08-30",
            status="active",
            notes="Initial treatment plan",
        )

        response = self.client.get("/api/crm/treatment-plans/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
    
class TreatmentSessionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="tester",
            password="testpass123",
        )
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
            diagnosis="Lung cancer",
            protocol="Standard fractionated radiotherapy",
            total_sessions=30,
            dose_per_session="2.00",
            total_dose="60.00",
            start_date="2026-07-15",
            end_date="2026-08-30",
            status="active",
            notes="Initial treatment plan",
        )

    def test_create_treatment_session(self):
        data = {
            "patient": self.patient.id,
            "treatment_plan": self.treatment_plan.id,
            "session_number": 1,
            "scheduled_datetime": "2026-07-16T09:00:00Z",
            "actual_datetime": None,
            "status": "scheduled",
            "machine": "LINAC 1",
            "room": "Room A",
            "dose_delivered": "2.00",
            "notes": "First session",
        }

        response = self.client.post("/api/crm/treatment-sessions/", data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["session_number"], 1)
        self.assertEqual(response.data["patient"], self.patient.id)
        self.assertEqual(response.data["treatment_plan"], self.treatment_plan.id)
    def test_list_treatment_sessions(self):
            TreatmentSession.objects.create(
                patient=self.patient,
                treatment_plan=self.treatment_plan,
                session_number=1,
                scheduled_datetime="2026-07-16T09:00:00Z",
                status="scheduled",
                machine="LINAC 1",
                room="Room A",
                dose_delivered="2.00",
                notes="First session",
            )

            response = self.client.get("/api/crm/treatment-sessions/")

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["count"], 1)

class CrmFilterSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="crm_reader",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.patient_ali = Patient.objects.create(
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
        self.patient_sara = Patient.objects.create(
            first_name="Sara",
            last_name="Ben Ali",
            cin="87654321",
            phone="22999999",
            email="sara@example.com",
            birth_date="1990-01-20",
            address="Sousse",
            medical_record_number="MR-0002",
            diagnosis="Second diagnosis",
            notes="Second test patient",
        )
        self.plan = TreatmentPlan.objects.create(
            patient=self.patient_ali,
            name="Radiotherapy Plan A",
            total_sessions=30,
            dose_per_session="2.00",
            total_dose="60.00",
            status="active",
        )

    def test_search_patients(self):
        response = self.client.get("/api/crm/patients/?search=Mansouri")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["first_name"], "Ali")

    def test_filter_treatment_plans_by_status(self):
        response = self.client.get("/api/crm/treatment-plans/?status=active")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], "active")

    def test_filter_treatment_sessions_by_status(self):
        TreatmentSession.objects.create(
            patient=self.patient_ali,
            treatment_plan=self.plan,
            session_number=1,
            scheduled_datetime="2026-07-16T09:00:00Z",
            status="completed",
            dose_delivered="2.00",
        )

        response = self.client.get("/api/crm/treatment-sessions/?status=completed")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], "completed")
        
class CrmPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.patient_data = {
            "first_name": "Youssef",
            "last_name": "Permission",
            "cin": "CRM-PERM-001",
            "phone": "22123499",
            "email": "crm.permission@example.com",
            "birth_date": "1994-05-12",
            "address": "Tunis",
            "medical_record_number": "MR-CRM-PERM-001",
            "diagnosis": "Permission test",
            "notes": "CRM permission test patient",
        }

    def test_accountant_cannot_create_patient(self):
        user = User.objects.create_user(
            username="accountant_crm_user",
            password="testpass123",
        )
        user.profile.role = "accountant"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/crm/patients/", self.patient_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_secretary_can_create_patient(self):
        user = User.objects.create_user(
            username="secretary_crm_user",
            password="testpass123",
        )
        user.profile.role = "secretary"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/crm/patients/", self.patient_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
