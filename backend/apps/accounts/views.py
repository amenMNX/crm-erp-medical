# apps/accounts/views.py
from django.contrib.auth.models import User
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import permissions, viewsets, status
from rest_framework.throttling import AnonRateThrottle
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters

from apps.audit.models import AuditLogEntry
from apps.audit.utils import log_event

from .models import CustomRole, RolePermission, UserProfile
from .serializers import (
    CustomRoleSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
    RolePermissionSerializer,
)
from rest_framework.permissions import BasePermission

# ⭐ NEW IMPORT
from .permissions import IsSuperAdmin


class IsSuperAdminOrStaff(BasePermission):
    """Allow both staff (admin) and superusers."""
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and (
            request.user.is_superuser or request.user.is_staff
        )


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related("profile").all().order_by("username")
    serializer_class = UserSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active", "profile__role", "profile__department"]
    search_fields = ["username", "email", "first_name", "last_name", "profile__phone"]
    ordering_fields = ["username", "email", "first_name", "last_name", "date_joined"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    def partial_update(self, request, *args, **kwargs):
        """
        Override PATCH so that when an admin changes a user's profile role,
        the pre_save / post_save signals on UserProfile fire correctly and
        the Employee auto-creation / sync logic in signals.py is triggered.

        The default ModelViewSet.partial_update already saves the User and its
        nested profile via UserSerializer, which does call profile.save() —
        so the signals fire automatically. This override just adds a clear
        comment and ensures we always use partial=True.
        """
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

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

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        log_event(
            AuditLogEntry.Action.LOGIN,
            actor=user,
            object_repr=user.username,
            changes={"ip": request.META.get("REMOTE_ADDR")},
        )

        response = Response(
            {
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_staff": user.is_staff,
                }
            },
            status=status.HTTP_200_OK,
        )

        response.set_cookie(
            key=settings.JWT_AUTH_COOKIE,
            value=access_token,
            httponly=settings.JWT_AUTH_HTTPONLY,
            secure=settings.JWT_AUTH_SECURE,
            samesite=settings.JWT_AUTH_SAMESITE,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            path=settings.JWT_AUTH_PATH,
        )
        response.set_cookie(
            key=settings.JWT_AUTH_REFRESH_COOKIE,
            value=refresh_token,
            httponly=settings.JWT_AUTH_HTTPONLY,
            secure=settings.JWT_AUTH_SECURE,
            samesite=settings.JWT_AUTH_SAMESITE,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            path=settings.JWT_AUTH_PATH,
        )

        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass

        response = Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)
        response.delete_cookie(settings.JWT_AUTH_COOKIE, path=settings.JWT_AUTH_PATH)
        response.delete_cookie(settings.JWT_AUTH_REFRESH_COOKIE, path=settings.JWT_AUTH_PATH)

        return response


class TokenRefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)

        if refresh_token is None:
            return Response(
                {"detail": "Refresh token not found."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
            new_refresh_token = str(refresh)

            response = Response({"access_token": access_token}, status=status.HTTP_200_OK)
            response.set_cookie(
                key=settings.JWT_AUTH_COOKIE,
                value=access_token,
                httponly=settings.JWT_AUTH_HTTPONLY,
                secure=settings.JWT_AUTH_SECURE,
                samesite=settings.JWT_AUTH_SAMESITE,
                max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
                path=settings.JWT_AUTH_PATH,
            )
            response.set_cookie(
                key=settings.JWT_AUTH_REFRESH_COOKIE,
                value=new_refresh_token,
                httponly=settings.JWT_AUTH_HTTPONLY,
                secure=settings.JWT_AUTH_SECURE,
                samesite=settings.JWT_AUTH_SAMESITE,
                max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
                path=settings.JWT_AUTH_PATH,
            )
            return response
        except TokenError:
            return Response(
                {"detail": "Invalid refresh token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        refresh_token = request.data.get("refresh")
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass

        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(APIView):
    """
    Public self-registration endpoint.

    Users who sign up here get role = ASSISTANT — the lowest-privilege
    built-in role.  This means:
      · They can log in and see their own data.
      · They are NOT automatically added as an Employee (ASSISTANT is
        excluded from _EMPLOYEE_ROLES in signals.py).
      · An admin can later promote them to a real staff role (doctor, hr,
        secretary, …), at which point the signal in signals.py will
        automatically create an Employee record for them.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Explicitly set role to ASSISTANT so self-registered users are never
        # accidentally promoted to employee via the default SECRETARY role.
        try:
            profile = user.profile
            profile.role = UserProfile.Role.ASSISTANT
            profile.save(update_fields=["role"])
        except Exception:
            pass

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

        return Response(
            {"detail": "Your password has been reset successfully."},
            status=status.HTTP_200_OK,
        )


class CustomRoleViewSet(viewsets.ModelViewSet):
    """CRUD for admin-defined custom roles."""
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


def get_default_permissions_for_role(role_name: str) -> list[str]:
    """Return default write permissions for a built-in role.
    Module names MUST match the French names used in the frontend MODULES array
    (src/routes/roles_permission.tsx).
    """
    default_map = {
        "admin": [
            "Patients", "Traitements", "Protocoles", "Calendrier", "Planning équipe",
            "Tickets", "Incidents", "Réclamations", "Messages",
            "Employés", "Congés", "Absences", "Avances sur salaire",
            "Formations & Compétences",
            "Factures", "Paiements", "CNAM", "Abonnements", "Paie", "Recouvrement",
            "Stocks médicaux", "Équipements",
        ],
        "doctor": ["Patients", "Traitements", "Protocoles", "Calendrier", "Réclamations"],
        "secretary": [
            "Patients", "Calendrier", "Planning équipe",
            "Tickets", "Réclamations",
            "Stocks médicaux",
        ],
        "accountant": ["Factures", "Paiements", "CNAM", "Abonnements", "Paie", "Recouvrement"],
        "hr": [
            "Employés", "Congés", "Absences", "Avances sur salaire",
            "Formations & Compétences", "Paie",
        ],
        "support_client": ["Tickets", "Incidents", "Réclamations"],
        "manager": [
            "Patients", "Calendrier", "Planning équipe",
            "Réclamations", "Incidents",
            "Employés",
        ],
        "receptionist": ["Patients", "Calendrier"],
        "assistant": ["Patients", "Calendrier"],
        "user": [],
    }
    return default_map.get(role_name, [])


class RolePermissionViewSet(viewsets.ModelViewSet):
    queryset = RolePermission.objects.all()
    serializer_class = RolePermissionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["role_name"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]

    def perform_create(self, serializer):
        role_name = self.request.data.get('role_name', '')
        write_permissions = self.request.data.get('write_permissions', [])
        view_permissions = self.request.data.get('view_permissions', [])  # ⭐ ADD THIS

        instance = serializer.save(
            is_built_in=False,
            write_permissions=write_permissions,
            view_permissions=view_permissions  # ⭐ ADD THIS
        )

        # Keep CustomRole in sync
        custom_role, created = CustomRole.objects.get_or_create(
            name=role_name,
            defaults={
                "write_permissions": write_permissions,
                "created_by": self.request.user,
            },
        )
        if not created and set(custom_role.write_permissions or []) != set(write_permissions or []):
            custom_role.write_permissions = write_permissions
            custom_role.save(update_fields=["write_permissions"])
            
            

    # ⭐ ADD THIS METHOD TO HANDLE UPDATES
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Get data from request
        write_permissions = request.data.get('write_permissions')
        view_permissions = request.data.get('view_permissions')
        
        # Update fields if provided
        if write_permissions is not None:
            instance.write_permissions = write_permissions
        if view_permissions is not None:
            instance.view_permissions = view_permissions
        
        instance.save()
        
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        from django.db import transaction
        instance = self.get_object()
        if instance.is_built_in:
            return Response(
                {"detail": "Built-in roles cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            CustomRole.objects.filter(name=instance.role_name).delete()
            return super().destroy(request, *args, **kwargs)


class AllRolePermissionsView(APIView):
    """Get all role permissions with built-in defaults if not in DB.

    Any authenticated user may GET — non-admins need this to render their
    own sidebar (canViewModule / canWriteModule checks in the frontend).
    Only admins can mutate via RolePermissionViewSet, so read access here
    is safe.
    """
    permission_classes = [permissions.IsAuthenticated]

    BUILT_IN_ROLES = [
        "admin", "doctor", "secretary",
        "accountant", "hr", "support_client", "manager",
        "receptionist", "assistant", "user"
    ]

    def get(self, request):
        all_perms = {
            p.role_name: p
            for p in RolePermission.objects.all()
        }

        result = []
        seen_names = set()

        for role_name in self.BUILT_IN_ROLES:
            seen_names.add(role_name)

            if role_name in all_perms:
                perm = all_perms[role_name]
                updated_fields = []
                if not perm.is_built_in:
                    perm.is_built_in = True
                    updated_fields.append("is_built_in")
                # Seed view_permissions if empty (migration/first-run case)
                if not perm.view_permissions:
                    perm.view_permissions = (
                        perm.write_permissions.copy()
                        if perm.write_permissions
                        else get_default_permissions_for_role(role_name)
                    )
                    updated_fields.append("view_permissions")
                if updated_fields:
                    perm.save(update_fields=updated_fields)
                result.append(perm)
            else:
                perm, _ = RolePermission.objects.get_or_create(
                    role_name=role_name,
                    defaults={
                        "is_built_in": True,
                        "write_permissions": get_default_permissions_for_role(role_name),
                        "view_permissions": get_default_permissions_for_role(role_name),  
                    },
                )
                # In case a concurrent request already created it as non-built-in
                if not perm.is_built_in:
                    perm.is_built_in = True
                    perm.save(update_fields=["is_built_in"])
                all_perms[role_name] = perm
                result.append(perm)

        custom_roles = CustomRole.objects.all()
        custom_role_names = set()

        for custom_role in custom_roles:
            custom_role_names.add(custom_role.name)

            if custom_role.name in seen_names:
                continue

            seen_names.add(custom_role.name)

            if custom_role.name in all_perms:
                perm = all_perms[custom_role.name]
                updated_fields = []

                if perm.is_built_in:
                    perm.is_built_in = False
                    updated_fields.append("is_built_in")

                if set(perm.write_permissions or []) != set(custom_role.write_permissions or []):
                    custom_role.write_permissions = perm.write_permissions
                    custom_role.save(update_fields=["write_permissions"])

                if updated_fields:
                    perm.save(update_fields=updated_fields)

                result.append(perm)
            else:
                perm = RolePermission.objects.create(
                    role_name=custom_role.name,
                    is_built_in=False,
                    write_permissions=custom_role.write_permissions,
                )
                all_perms[custom_role.name] = perm
                result.append(perm)

        for perm in RolePermission.objects.filter(is_built_in=False):
            if perm.role_name not in seen_names and perm.role_name not in custom_role_names:
                seen_names.add(perm.role_name)
                result.append(perm)

        result.sort(key=lambda p: (not p.is_built_in, p.role_name.lower()))

        serializer = RolePermissionSerializer(result, many=True)
        return Response(serializer.data)


class MyPermissionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    BUILT_IN_ROLES = {
        "admin", "doctor", "secretary", "accountant", "hr",
        "support_client", "manager", "receptionist", "assistant", "user",
    }

    def get(self, request):
        user = request.user
        profile = getattr(user, "profile", None)

        # Superuser / staff → full access
        is_super = (
            user.is_superuser
            or (profile and getattr(profile, "is_super_admin", False))
        )
        if is_super:
            return Response({
                "role": "admin",
                "is_admin": True,
                "write_permissions": ["__all__"],
                "view_permissions": ["__all__"],
            })

        role_slug = (profile.role if profile else None) or "user"

        # Get permissions from RolePermission
        try:
            if role_slug in self.BUILT_IN_ROLES:
                rp = RolePermission.objects.get(role_name=role_slug)
            else:
                rp = user.employee_profile.role
            
            # ⭐ Use stored view_permissions if available
            write_perms = rp.write_permissions or []
            view_perms = rp.view_permissions or []  # ⭐ Use stored view_permissions
            
            # ⭐ If view_permissions is empty but write_permissions has values,
            # use write_permissions as view_permissions (backward compatibility)
            if not view_perms and write_perms:
                view_perms = write_perms.copy()
                
        except Exception:
            raw = get_default_permissions_for_role(role_slug)
            write_perms = raw
            view_perms = raw.copy()

        return Response({
            "role": role_slug,
            "is_admin": False,
            "write_permissions": write_perms,
            "view_permissions": view_perms,
        })


# ⭐ NEW VIEW
class SuperAdminCheckView(APIView):
    """Vue de test pour vérifier les droits Super Admin."""
    permission_classes = [IsSuperAdmin]
    
    def get(self, request):
        return Response({
            "status": "OK",
            "message": "Vous êtes Super Admin !",
            "user": {
                "id": request.user.id,
                "username": request.user.username,
                "email": request.user.email,
            }
        })