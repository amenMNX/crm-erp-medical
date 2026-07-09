from rest_framework.permissions import BasePermission, SAFE_METHODS

def get_user_role(user):
    
    if not user or not user.is_authenticated:
        return None
    
    if user.is_superuser:
        return "admin"

    profile = getattr(user, "profile", None)
    if not profile:
        return None 
    
    return profile.role

class IsAdminRole(BasePermission):
    """
    Allows access only to users with the 'admin' role.
    """
    def has_permission(self, request, view):
        return get_user_role(request.user) == "admin"

class IsDoctorRole(BasePermission):
    """
    Allows access only to users with the 'doctor' role.
    """
    def has_permission(self, request, view):
        return get_user_role(request.user) == "doctor"
    

class IsSecretaryDoctorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ["admin", "doctor", "secretary"]


class IsAccountantOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ["admin", "accountant"]


class IsHrOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return get_user_role(request.user) in ["admin", "hr"]


class ReadOnlyOrRole(BasePermission):
    allowed_roles = []

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user and request.user.is_authenticated

        return get_user_role(request.user) in self.allowed_roles