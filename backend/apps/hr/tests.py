from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Employee


class EmployeeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="hr_admin",
            password="testpass123",
            is_staff=True,
        )
        self.user.profile.role = "hr"
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)

        self.employee_data = {
            "employee_number": "EMP-0001",
            "first_name": "Nadia",
            "last_name": "Karoui",
            "job_title": "Radiotherapist",
            "department": "Radiotherapy",
            "phone": "22111222",
            "email": "nadia@example.com",
            "hire_date": "2026-01-15",
            "contract_type": "cdi",
            "is_active": True,
            "notes": "Senior staff",
        }

    def test_create_employee(self):
        response = self.client.post("/api/hr/employees/", self.employee_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Employee.objects.count(), 1)
        self.assertEqual(response.data["employee_number"], "EMP-0001")

    def test_list_employees(self):
        Employee.objects.create(**self.employee_data)

        response = self.client.get("/api/hr/employees/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_search_employees(self):
        Employee.objects.create(**self.employee_data)

        response = self.client.get("/api/hr/employees/?search=Nadia")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["first_name"], "Nadia")

    def test_filter_employees_by_department(self):
        Employee.objects.create(**self.employee_data)

        response = self.client.get("/api/hr/employees/?department=Radiotherapy")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

class HrPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.employee_data = {
            "employee_number": "EMP-PERM-0001",
            "first_name": "Sami",
            "last_name": "Ben Ali",
            "job_title": "HR Manager",
            "department": "HR",
            "phone": "22999888",
            "email": "sami.hr@example.com",
            "hire_date": "2026-02-01",
            "contract_type": "cdi",
            "is_active": True,
            "notes": "Permission test",
        }

    def test_secretary_cannot_create_employee(self):
        user = User.objects.create_user(
            username="secretary_hr_user",
            password="testpass123",
        )
        user.profile.role = "secretary"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/hr/employees/", self.employee_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hr_can_create_employee(self):
        user = User.objects.create_user(
            username="hr_permission_user",
            password="testpass123",
        )
        user.profile.role = "hr"
        user.profile.save()

        self.client.force_authenticate(user=user)

        response = self.client.post("/api/hr/employees/", self.employee_data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)