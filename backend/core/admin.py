from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from . import models


@admin.register(models.User)
class SchoolUserAdmin(UserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "phone", "is_active")
    list_filter = ("role", "is_active")
    fieldsets = UserAdmin.fieldsets + (("School", {"fields": (
        "role", "phone", "language", "telegram_chat_id", "notify_email", "notify_whatsapp", "notify_telegram", "children")}),)


for m in [models.Level, models.Group, models.Module, models.Room, models.Session, models.Attendance, models.Grade,
          models.Payment, models.Announcement, models.Closure, models.Notification, models.Teaching,
          models.Subscription, models.SchoolSettings]:
    admin.site.register(m)
