# apps/accounts/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    ChangePasswordView,
    CustomRoleViewSet,
    CurrentUserView,
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    TokenRefreshView,
    UserViewSet,
    RolePermissionViewSet,
    AllRolePermissionsView,
    SuperAdminCheckView,  
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("custom-roles", CustomRoleViewSet, basename="custom-role")
router.register("role-permissions", RolePermissionViewSet, basename="role-permission")

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="api-token-login"),
    path("logout/", LogoutView.as_view(), name="api-token-logout"),
    path("refresh/", TokenRefreshView.as_view(), name="api-token-refresh"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("all-role-permissions/", AllRolePermissionsView.as_view(), name="all-role-permissions"),
    path('super-admin/check/', SuperAdminCheckView.as_view(), name='super-admin-check'),
    path("", include(router.urls)),
]