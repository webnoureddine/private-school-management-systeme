from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


class LoginView(TokenObtainPairView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/auth/login/", LoginView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/", include("core.urls")),
]

# Serve the built React app for every other URL (single deployment).
if (settings.FRONTEND_DIST / "index.html").exists():
    urlpatterns.append(re_path(r"^(?!api/|django-admin/|static/).*$", TemplateView.as_view(template_name="index.html")))
else:
    urlpatterns.append(path("", lambda r: HttpResponse("API is running. Build the frontend (npm run build) to serve the app here.")))
