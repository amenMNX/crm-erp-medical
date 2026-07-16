from django.contrib.auth.models import User
from rest_framework import permissions, viewsets

from rest_framework import status
from rest_framework.authtoken.models import Token

from .serializers import PasswordChangeSerializer, UserSerializer
from rest_framework.response import Response
from rest_framework.views import APIView

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters


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

class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
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

        Token.objects.filter(user=request.user).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)