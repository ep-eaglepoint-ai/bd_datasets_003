from __future__ import annotations

from rest_framework.permissions import SAFE_METHODS
from rest_framework.permissions import BasePermission

from organizations.models import OrganizationMembership


_SCOPE_LEVEL = {
    "read": 0,
    "write": 1,
    "admin": 2,
}


def _get_org_slug(view) -> str | None:
    return getattr(getattr(view, "kwargs", None), "get", lambda k, d=None: None)("organization_slug")


def _get_membership(request, organization_slug: str):
    if not request.user or not request.user.is_authenticated:
        return None
    membership = OrganizationMembership.objects.select_related("organization").filter(
        organization__slug=organization_slug,
        user=request.user,
        is_active=True,
    ).first()
    if membership is not None:
        # Cache on request to avoid an extra Organization query in view code.
        setattr(request, "_scoped_organization", membership.organization)
        setattr(request, "_scoped_membership", membership)
    return membership


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view) -> bool:
        slug = view.kwargs.get("organization_slug")
        if not slug:
            return False
        return _get_membership(request, slug) is not None


class IsMember(BasePermission):
    def has_permission(self, request, view) -> bool:
        slug = view.kwargs.get("organization_slug")
        membership = _get_membership(request, slug) if slug else None
        return membership is not None and membership.has_permission(OrganizationMembership.Role.MEMBER)


class IsAdmin(BasePermission):
    def has_permission(self, request, view) -> bool:
        slug = view.kwargs.get("organization_slug")
        membership = _get_membership(request, slug) if slug else None
        return membership is not None and membership.has_permission(OrganizationMembership.Role.ADMIN)


class IsOwner(BasePermission):
    def has_permission(self, request, view) -> bool:
        slug = view.kwargs.get("organization_slug")
        membership = _get_membership(request, slug) if slug else None
        return membership is not None and membership.has_permission(OrganizationMembership.Role.OWNER)


class APIKeyScopeEnforcer(BasePermission):
    """Enforce API key scopes on requests authenticated via APIKeyAuthentication.

    View can declare:
      - api_key_admin_actions = "*" or a set of action names requiring admin scope.
      - api_key_required_scope = "read"|"write"|"admin" to override default.

    Defaults:
      - SAFE methods -> "read"
      - unsafe methods -> "write"
    """

    def has_permission(self, request, view) -> bool:
        api_key = getattr(request, "api_key", None)
        if api_key is None:
            return True

        required = getattr(view, "api_key_required_scope", None)
        if not required:
            required = "read" if request.method in SAFE_METHODS else "write"

        admin_actions = getattr(view, "api_key_admin_actions", None)
        action = getattr(view, "action", None)
        if admin_actions == "*" or (isinstance(admin_actions, set) and action in admin_actions):
            required = "admin"

        scope = getattr(api_key, "scope", "read")
        return _SCOPE_LEVEL.get(str(scope), 0) >= _SCOPE_LEVEL.get(str(required), 2)
