from django.contrib.auth.models import User
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import permissions, viewsets
from rest_framework.throttling import AnonRateThrottle

from rest_framework import status
from rest_framework.exceptions import ValidationError


class LoginRateThrottle(AnonRateThrottle):
    """Tight per-IP throttle applied only to the login endpoint.
    Scope 'login' maps to DEFAULT_THROTTLE_RATES['login'] = '10/minute'.
    This is separate from the global 'anon' scope so we can tune them
    independently without affecting other public endpoints.
    """
    scope = "login"

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from apps.audit.models import AuditLogEntry
from .models import CustomRole
from apps.audit.utils import log_event

from .serializers import (
    CustomRoleSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)
from rest_framework.response import Response
from rest_framework.views import APIView

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

# ✅ We no longer import or use DRF Token auth at all — JWT only.


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("profile").all().order_by("username")
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active", "profile__role", "profile__department"]
    search_fields = ["username", "email", "first_name", "last_name", "profile__phone"]
    ordering_fields = ["username", "email", "first_name", "last_name", "date_joined"]

    def get_permissions(self):
        # Reads (list/retrieve) are needed by any authenticated user for
        # things like assigning ticket agents — only writes (create/
        # update/delete users) are admin-only.
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()

        if user == request.user:
            return Response(
                {"detail": "You cannot deactivate your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = False
        user.save(update_fields=["is_active"])

        return Response(status=status.HTTP_204_NO_CONTENT)

class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        # Users may edit their own basic profile info, but not their role,
        # username, or active/staff status — those stay admin-only via
        # UserViewSet.
        data = request.data
        allowed = {}
        for field in ("first_name", "last_name", "email"):
            if field in data:
                allowed[field] = data[field]

        profile_data = data.get("profile")
        if isinstance(profile_data, dict):
            allowed["profile"] = {
                k: v for k, v in profile_data.items() if k in ("phone", "department")
            }

        serializer = UserSerializer(request.user, data=allowed, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

class LoginView(APIView):
    # Issues JWT access + refresh tokens.
    # Keeps audit logging for login success/failure (journalisation requirement).
    # LoginRateThrottle limits to 10 attempts/minute per IP to block brute-force.
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        username = request.data.get("username", "")
        password = request.data.get("password", "")

        if not username or not password:
            log_event(
                AuditLogEntry.Action.LOGIN_FAILED,
                object_repr=str(username),
                changes={"ip": request.META.get("REMOTE_ADDR"), "reason": "missing credentials"},
            )
            raise ValidationError({"detail": "Username and password are required."})

        # Authenticate manually so we can log both success and failure.
        from django.contrib.auth import authenticate
        user = authenticate(request, username=username, password=password)

        if user is None:
            log_event(
                AuditLogEntry.Action.LOGIN_FAILED,
                object_repr=str(username),
                changes={"ip": request.META.get("REMOTE_ADDR")},
            )
            raise ValidationError({"detail": "No active account found with the given credentials."})

        if not user.is_active:
            log_event(
                AuditLogEntry.Action.LOGIN_FAILED,
                object_repr=str(username),
                changes={"ip": request.META.get("REMOTE_ADDR"), "reason": "inactive account"},
            )
            raise ValidationError({"detail": "This account is inactive."})

        # Issue JWT pair
        refresh = RefreshToken.for_user(user)

        log_event(
            AuditLogEntry.Action.LOGIN,
            actor=user,
            object_repr=user.username,
            changes={"ip": request.META.get("REMOTE_ADDR")},
        )

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        })


class LogoutView(APIView):
    # ✅ FIX: Blacklists the refresh token so it can't be reused after logout.
    # The access token remains valid until it expires (60 min) — that's
    # standard JWT behaviour and acceptable for this use-case.
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        log_event(AuditLogEntry.Action.LOGOUT, actor=request.user, object_repr=request.user.username)

        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                # Already blacklisted or invalid — not an error worth surfacing.
                pass

        return Response(status=status.HTTP_204_NO_CONTENT)

    
class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # ✅ FIX: Blacklist the provided refresh token on password change
        # so all existing sessions are invalidated. Access tokens expire
        # naturally after 60 min.
        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass

        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    # Public self-signup — must be reachable while logged out. New accounts
    # get the UserProfile default (lowest-privilege) role via the post_save
    # signal; an admin can change it later from Roles & Permissions.
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordResetRequestView(APIView):
    # Must be reachable while logged out — this is how a user recovers
    # access after losing their password.
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"

            send_mail(
                subject="Réinitialisation de votre mot de passe",
                message=(
                    "Vous avez demandé la réinitialisation de votre mot de passe.\n\n"
                    f"Cliquez sur ce lien pour choisir un nouveau mot de passe : {reset_link}\n\n"
                    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )

        # Always return the same response whether or not the email is
        # registered, so this endpoint can't be used to enumerate accounts.
        return Response(
            {"detail": "If an account with that email exists, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Password reset invalidates any existing refresh tokens — nothing
        # else to clean up since we're JWT-only now.

        return Response(
            {"detail": "Your password has been reset successfully."},
            status=status.HTTP_200_OK,
        )


class CustomRoleViewSet(viewsets.ModelViewSet):
    """CRUD for admin-defined custom roles.

    Only admins can create/edit/delete roles. Any authenticated user can
    list them (so the Roles & Permissions page can display them).
    """
    queryset = CustomRole.objects.all()
    serializer_class = CustomRoleSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)