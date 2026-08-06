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
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("custom-roles", CustomRoleViewSet, basename="custom-role")

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
    path("", include(router.urls)),
]