from django.test import TestCase

# Create your tests here.
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import UserProfile
class AccountsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(#superuser
            username="admin",
            email="admin@example.com",
            password="testpass123",
        )
        self.normal_user = User.objects.create_user(#user normal
            username="doctor",
            email="doctor@example.com",
            password="testpass123",
            first_name="Doctor",
            last_name="One",
        )
    def test_admin_can_list_users(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["username"], "admin")

    def test_normal_user_cannot_list_users(self):
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_cannot_list_users(self):
        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)    
    def test_profile_is_created_automatically_for_new_user(self):
        user = User.objects.create_user(
            username="nurse",
            email="nurse@example.com",
            password="testpass123",
        )

        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        self.assertEqual(user.profile.role, "secretary")

    def test_current_user_returns_profile(self):
        self.client.force_authenticate(user=self.normal_user)

        response = self.client.get("/api/accounts/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "doctor")
        self.assertIn("profile", response.data)
        self.assertEqual(response.data["profile"]["role"], "secretary")