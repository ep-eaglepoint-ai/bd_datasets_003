from __future__ import annotations

from rest_framework.permissions import BasePermission

from organizations.models import OrganizationMembership


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
