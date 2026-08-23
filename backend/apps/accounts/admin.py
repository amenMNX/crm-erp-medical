# apps/accounts/admin.py
from django.contrib import admin

from .models import UserProfile, CustomRole, RolePermission


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "is_super_admin", "phone", "department")  # ⭐ ADDED is_super_admin
    search_fields = ("user__username", "user__email", "phone", "department")
    list_filter = ("role", "is_super_admin", "department")  # ⭐ ADDED is_super_admin
    fieldsets = (
        (None, {
            'fields': ('user', 'role', 'is_super_admin', 'phone', 'department')  # ⭐ ADDED is_super_admin
        }),
    )


@admin.register(CustomRole)
class CustomRoleAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "created_at")
    search_fields = ("name",)
    list_filter = ("created_at",)


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ("role_name", "is_built_in", "created_at", "updated_at")
    search_fields = ("role_name",)
    list_filter = ("is_built_in",)