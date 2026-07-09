from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient


class AuthTokenApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="login_user",
            password="testpass123",
        )

    def test_login_returns_token(self):
        response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "login_user",
                "password": "testpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("token", response.data)

    def test_login_rejects_wrong_password(self):
        response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "login_user",
                "password": "wrongpass",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
class CurrentUserApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="me_user",
            password="testpass123",
            email="me@example.com",
            first_name="Mehdi",
            last_name="User",
        )
        self.user.profile.role = "doctor"
        self.user.profile.phone = "22123456"
        self.user.profile.department = "Radiotherapy"
        self.user.profile.save()

    def test_me_requires_authentication(self):
        response = self.client.get("/api/accounts/me/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_returns_current_user(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/accounts/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "me_user")
        self.assertEqual(response.data["email"], "me@example.com")
        self.assertEqual(response.data["first_name"], "Mehdi")
        self.assertEqual(response.data["last_name"], "User")
        self.assertEqual(response.data["profile"]["role"], "doctor")
        self.assertEqual(response.data["profile"]["phone"], "22123456")
        self.assertEqual(response.data["profile"]["department"], "Radiotherapy")
        
class LogoutApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user=User.objects.create_user(
            username="logout_user",
            password="testpass123",
        )
        
    def test_logout_requires_authentication(self):
        response = self.client.post("/api/accounts/logout/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
    
    def test_logout_deletes_token(self):
        login_response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "logout_user",
                "password": "testpass123",
            },
            format="json",
        )
        token = login_response.data["token"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        response = self.client.post("/api/accounts/logout/")
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
        me_response = self.client.get("/api/accounts/me/")

        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)

class UserAdminApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin_user",
            password="testpass123",
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)

    def test_admin_cannot_delete_own_account(self):
        response = self.client.delete(f"/api/accounts/users/{self.admin.id}/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.admin.refresh_from_db()

        self.assertTrue(self.admin.is_active)

    def test_admin_delete_user_deactivates_instead_of_removing(self):
        user = User.objects.create_user(
            username="soft_delete_user",
            password="testpass123",
            is_active=True,
        )

        response = self.client.delete(f"/api/accounts/users/{user.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        user.refresh_from_db()

        self.assertFalse(user.is_active)

    def test_admin_can_order_users_by_username(self):
        User.objects.create_user(
            username="z_user",
            password="testpass123",
        )
        User.objects.create_user(
            username="a_user",
            password="testpass123",
        )

        response = self.client.get("/api/accounts/users/?ordering=username")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        usernames = [
            user["username"]
            for user in response.data["results"]
        ]
        self.assertEqual(usernames[0], "a_user")

    def test_admin_can_search_users(self):
        User.objects.create_user(
            username="doctor_search_user",
            password="testpass123",
            first_name="Sarra",
        )

        response = self.client.get("/api/accounts/users/?search=Sarra")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "doctor_search_user")

    def test_admin_can_filter_users_by_role(self):
        doctor = User.objects.create_user(
            username="doctor_filter_user",
            password="testpass123",
        )
        doctor.profile.role = "doctor"
        doctor.profile.save()

        accountant = User.objects.create_user(
            username="accountant_filter_user",
            password="testpass123",
        )
        accountant.profile.role = "accountant"
        accountant.profile.save()

        response = self.client.get("/api/accounts/users/?profile__role=doctor")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "doctor_filter_user")
    def test_admin_can_list_users(self):
        User.objects.create_user(
            username="listed_user",
            password="testpass123",
        )

        response = self.client.get("/api/accounts/users/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 2)

    def test_admin_can_retrieve_user_detail(self):
        user = User.objects.create_user(
            username="detail_user",
            password="testpass123",
            email="detail@example.com",
        )

        response = self.client.get(f"/api/accounts/users/{user.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "detail_user")
        self.assertEqual(response.data["email"], "detail@example.com")
        
    def test_admin_can_update_user_password(self):
        user = User.objects.create_user(
            username="password_update_user",
            password="oldpass123",
        )

        response = self.client.patch(
            f"/api/accounts/users/{user.id}/",
            {
                "password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()

        self.assertTrue(user.check_password("newpass123"))
        self.assertFalse(user.check_password("oldpass123"))
        
    def test_admin_can_create_user_with_profile(self):
        response = self.client.post(
            "/api/accounts/users/",
            {
                "username": "doctor_user",
                "password": "testpass123",
                "email": "doctor@example.com",
                "first_name": "Doctor",
                "last_name": "User",
                "profile": {
                    "role": "doctor",
                    "phone": "22123456",
                    "department": "Radiotherapy",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        user = User.objects.get(username="doctor_user")
        self.assertTrue(user.check_password("testpass123"))
        self.assertEqual(user.profile.role, "doctor")
        self.assertEqual(user.profile.department, "Radiotherapy")

    def test_non_admin_cannot_create_user(self):
        normal_user = User.objects.create_user(
            username="normal_user",
            password="testpass123",
        )
        self.client.force_authenticate(user=normal_user)

        response = self.client.post(
            "/api/accounts/users/",
            {
                "username": "blocked_user",
                "password": "testpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            
    def test_admin_can_deactivate_user(self):
        user = User.objects.create_user(
            username="deactivate_user",
            password="testpass123",
            is_active=True,
        )

        response = self.client.patch(
            f"/api/accounts/users/{user.id}/",
            {
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()

        self.assertFalse(user.is_active)

    def test_admin_cannot_change_staff_flag_from_api(self):
        user = User.objects.create_user(
            username="staff_flag_user",
            password="testpass123",
            is_staff=False,
        )

        response = self.client.patch(
            f"/api/accounts/users/{user.id}/",
            {
                "is_staff": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        user.refresh_from_db()

        self.assertFalse(user.is_staff)

class ChangePasswordApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="password_user",
            password="oldpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_user_can_change_own_password(self):
        response = self.client.post(
            "/api/accounts/change-password/",
            {
                "old_password": "oldpass123",
                "new_password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        self.user.refresh_from_db()

        self.assertTrue(self.user.check_password("newpass123"))

    def test_change_password_rejects_wrong_old_password(self):
        response = self.client.post(
            "/api/accounts/change-password/",
            {
                "old_password": "wrongpass",
                "new_password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("old_password", response.data)
        
    def test_change_password_invalidates_existing_token(self):
        self.client.force_authenticate(user=None)

        login_response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "password_user",
                "password": "oldpass123",
            },
            format="json",
        )
        token = login_response.data["token"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")

        response = self.client.post(
            "/api/accounts/change-password/",
            {
                "old_password": "oldpass123",
                "new_password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        me_response = self.client.get("/api/accounts/me/")
        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.credentials()

        new_login_response = self.client.post(
            "/api/accounts/login/",
            {
                "username": "password_user",
                "password": "newpass123",
            },
            format="json",
        )

        self.assertEqual(new_login_response.status_code, status.HTTP_200_OK)
        self.assertIn("token", new_login_response.data)