from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import ChangePasswordView, CurrentUserView, LogoutView, UserViewSet
from rest_framework.authtoken.views import obtain_auth_token

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("login/", obtain_auth_token, name="api-token-login"),
    path("logout/", LogoutView.as_view(), name="api-token-logout"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("", include(router.urls)),
]
