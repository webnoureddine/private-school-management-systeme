from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

r = DefaultRouter()
for name, vs in [("users", views.UserViewSet), ("levels", views.LevelViewSet), ("groups", views.GroupViewSet),
                 ("modules", views.ModuleViewSet), ("rooms", views.RoomViewSet), ("sessions", views.SessionViewSet),
                 ("grades", views.GradeViewSet), ("payments", views.PaymentViewSet),
                 ("announcements", views.AnnouncementViewSet), ("closures", views.ClosureViewSet),
                 ("notifications", views.NotificationViewSet), ("teachings", views.TeachingViewSet),
                 ("subscriptions", views.SubscriptionViewSet)]:
    r.register(name, vs, basename=name)

urlpatterns = [
    path("", include(r.urls)),
    path("dashboard/", views.dashboard),
    path("daily/", views.daily),
    path("students/", views.students_list),
    path("students/<int:pk>/profile/", views.student_profile_view),
    path("me/profile/", views.my_profile),
    path("me/teaching/", views.my_teaching),
    path("me/students/", views.my_students),
    path("cron/daily/", views.run_daily),
    path("settings/", views.school_settings),
    path("settings/public/", views.public_settings),
    path("settings/test/", views.test_channel_view),
    path("settings/telegram/", views.telegram_setup),
    path("telegram/webhook/<str:secret>/", views.telegram_webhook),
]
