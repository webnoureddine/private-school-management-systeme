from rest_framework.permissions import SAFE_METHODS, BasePermission


def _is_admin(u):
    """School admin (director) or superuser."""
    return u.is_authenticated and (u.is_superuser or u.role == "admin")


def _is_manager(u):
    """Admin or administrative staff (secretariat)."""
    return u.is_authenticated and (u.is_superuser or u.role in ("admin", "staff"))


class IsAdmin(BasePermission):
    """Management: admin + staff (secretariat)."""
    def has_permission(self, request, view): return _is_manager(request.user)


class IsSchoolAdmin(BasePermission):
    """Director only (school settings, channel keys)."""
    def has_permission(self, request, view): return _is_admin(request.user)


class IsAdminOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and (request.method in SAFE_METHODS or _is_manager(request.user))


class IsStaffRole(BasePermission):
    """Management + teachers."""
    def has_permission(self, request, view):
        u = request.user
        return u.is_authenticated and (_is_manager(u) or u.role == "teacher")
