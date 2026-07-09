from django.contrib import admin

from .models import UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "phone", "department")
    search_fields = ("user__username", "user__email", "phone", "department")
    list_filter = ("role", "department")