from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Max
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from organizations.models import APIKey, Invitation, Organization, OrganizationMembership, Project, UserProfile
from organizations.permissions import APIKeyScopeEnforcer, IsAdmin, IsMember, IsOrganizationMember, IsOwner
from organizations.serializers import (
    APIKeyCreateSerializer,
    APIKeySerializer,
    InvitationSerializer,
    MembershipSerializer,
    OrganizationCreateSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    UserProfileSerializer,
)


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, APIKeyScopeEnforcer]
    api_key_admin_actions = {"destroy"}

    lookup_field = "slug"

    def get_queryset(self):
        return Organization.objects.filter(memberships__user=self.request.user, memberships__is_active=True).distinct()

    def get_serializer_class(self):
        if self.action == "create":
            return OrganizationCreateSerializer
        return OrganizationSerializer

    def destroy(self, request, *args, **kwargs):
        org = self.get_object()
        membership = OrganizationMembership.objects.filter(
            organization=org,
            user=request.user,
            is_active=True,
        ).first()
        if membership is None or not membership.has_permission(OrganizationMembership.Role.OWNER):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


class OrganizationScopedMixin:
    def get_organization(self) -> Organization:
        slug = self.kwargs.get("organization_slug")
        from_auth = getattr(self.request, "organization", None)
        if from_auth is not None and getattr(from_auth, "slug", None) == slug:
            return from_auth

        from_perm = getattr(self.request, "_scoped_organization", None)
        if from_perm is not None and getattr(from_perm, "slug", None) == slug:
            return from_perm
        return get_object_or_404(Organization, slug=slug)


class MembershipViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    serializer_class = MembershipSerializer
    api_key_admin_actions = {"create", "update", "partial_update", "destroy"}

    def get_queryset(self):
        org = self.get_organization()
        return OrganizationMembership.objects.filter(organization=org).select_related("user", "organization")

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated(), IsOrganizationMember(), APIKeyScopeEnforcer()]
        return [IsAuthenticated(), IsAdmin(), APIKeyScopeEnforcer()]

    def destroy(self, request, *args, **kwargs):
        membership = self.get_object()
        if membership.role == OrganizationMembership.Role.OWNER and membership.is_active:
            return Response(
                {"detail": "Owner membership cannot be removed; use transfer_ownership"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class ProjectViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    serializer_class = ProjectSerializer

    def get_queryset(self):
        org = self.get_organization()
        qs = Project.objects.filter(organization=org)
        if self.action == "list":
            # Default view hides archived.
            qs = qs.filter(status=Project.Status.ACTIVE)
        return qs

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated(), IsOrganizationMember(), APIKeyScopeEnforcer()]
        return [IsAuthenticated(), IsMember(), APIKeyScopeEnforcer()]

    def perform_create(self, serializer):
        org = self.get_organization()
        serializer.save(organization=org)


class InvitationViewSet(OrganizationScopedMixin, viewsets.ModelViewSet):
    serializer_class = InvitationSerializer
    api_key_required_scope = "admin"

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx

    def get_queryset(self):
        org = self.get_organization()
        return Invitation.objects.filter(organization=org)

    def get_permissions(self):
        if self.action in {"list", "retrieve", "create"}:
            return [IsAuthenticated(), IsAdmin(), APIKeyScopeEnforcer()]
        return [IsAuthenticated(), IsAdmin(), APIKeyScopeEnforcer()]

    def perform_create(self, serializer):
        org = self.get_organization()
        invitation = serializer.save(organization=org, created_by=self.request.user)
        try:
            invitation.send_invitation_email()
        except Exception:
            # Email failures must not break invitation creation.
            pass


class APIKeyViewSet(OrganizationScopedMixin, viewsets.GenericViewSet, mixins.ListModelMixin, mixins.CreateModelMixin):
    permission_classes = [IsAuthenticated, IsAdmin, APIKeyScopeEnforcer]
    api_key_required_scope = "admin"

    def get_queryset(self):
        org = self.get_organization()
        return APIKey.objects.filter(organization=org)

    def get_serializer_class(self):
        if self.action == "create":
            return APIKeyCreateSerializer
        return APIKeySerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.get_organization()
        return ctx

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke(self, request, organization_slug=None, pk=None):
        api_key = self.get_object()
        if api_key.revoked_at is not None:
            return Response({"detail": "Already revoked"}, status=status.HTTP_400_BAD_REQUEST)
        api_key.revoke()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrganizationDashboardViewSet(OrganizationScopedMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsOrganizationMember, APIKeyScopeEnforcer]

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request, organization_slug=None):
        org = self.get_organization()
        cache_key = f"org-dashboard:{org.slug}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        projects_agg = Project.objects.filter(organization=org).aggregate(
            total_projects=Count("id"),
            latest_project_created_at=Max("created_at"),
        )
        total_projects = int(projects_agg["total_projects"] or 0)
        latest_project_created_at = projects_agg["latest_project_created_at"]
        active_users = OrganizationMembership.objects.filter(organization=org, is_active=True).count()

        since = timezone.now().date() - timedelta(days=13)
        trends_qs = (
            Project.objects.filter(organization=org, created_at__date__gte=since)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        activity_trends = [{"day": row["day"].isoformat(), "count": row["count"]} for row in trends_qs]

        payload = {
            "organization": {"slug": org.slug, "name": org.name},
            "total_projects": total_projects,
            "active_users": active_users,
            "latest_project_created_at": latest_project_created_at.isoformat() if latest_project_created_at else None,
            "generated_at": timezone.now().isoformat(),
            "activity_trends": activity_trends,
        }
        cache.set(cache_key, payload, timeout=300)
        return Response(payload)


class JoinViewSet(viewsets.ViewSet):
    permission_classes = [AllowAny]

    def get_permissions(self):
        if getattr(self, "action", None) == "accept":
            return [IsAuthenticated()]
        return [AllowAny()]

    def _get_invitation(self, token: str) -> Invitation:
        return get_object_or_404(Invitation.objects.select_related("organization"), token=token)

    @action(detail=False, methods=["get"], url_path=r"(?P<token>[^/.]+)")
    def validate(self, request, token=None):
        invitation = self._get_invitation(token)
        if invitation.accepted_at is not None:
            return Response({"detail": "Invitation already used"}, status=status.HTTP_400_BAD_REQUEST)
        if invitation.expires_at <= timezone.now():
            return Response({"detail": "Invitation expired"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "organization": {"name": invitation.organization.name, "slug": invitation.organization.slug},
                "email": invitation.email,
                "role": invitation.role,
                "expires_at": invitation.expires_at.isoformat(),
            }
        )

    @action(detail=False, methods=["post"], url_path=r"(?P<token>[^/.]+)/accept")
    def accept(self, request, token=None):
        invitation = self._get_invitation(token)
        try:
            with transaction.atomic():
                membership = invitation.accept(request.user)
                profile, _ = UserProfile.objects.get_or_create(user=request.user)
                if profile.primary_organization_id is None:
                    profile.primary_organization = membership.organization
                    profile.save(update_fields=["primary_organization"])
        except ValidationError as exc:
            raise ValidationError(detail=str(exc))
        return Response({"membership_id": membership.id}, status=status.HTTP_200_OK)


class ProfileViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def retrieve(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(UserProfileSerializer(profile, context={"request": request}).data)

    def partial_update(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TransferOwnershipViewSet(OrganizationScopedMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated, IsOwner, APIKeyScopeEnforcer]
    api_key_required_scope = "admin"

    @action(detail=False, methods=["post"], url_path="transfer_ownership")
    def transfer(self, request, organization_slug=None):
        org = self.get_organization()
        target_user_id = request.data.get("user_id")
        if not target_user_id:
            raise ValidationError({"user_id": "This field is required."})

        with transaction.atomic():
            current_owner = (
                OrganizationMembership.objects.select_for_update()
                .filter(organization=org, role=OrganizationMembership.Role.OWNER, is_active=True, user_id=request.user.id)
                .first()
            )
            if not current_owner:
                return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

            target = (
                OrganizationMembership.objects.select_for_update()
                .filter(organization=org, user_id=target_user_id, is_active=True)
                .first()
            )
            if not target:
                return Response({"detail": "Target user is not a member"}, status=status.HTTP_400_BAD_REQUEST)

            current_owner.role = OrganizationMembership.Role.ADMIN
            current_owner.save(update_fields=["role"])

            target.role = OrganizationMembership.Role.OWNER
            target.save(update_fields=["role"])

            owners = OrganizationMembership.objects.filter(
                organization=org,
                role=OrganizationMembership.Role.OWNER,
                is_active=True,
            ).count()
            if owners != 1:
                raise ValidationError({"detail": "Organization must have exactly one owner"})

        return Response({"detail": "Ownership transferred"}, status=status.HTTP_200_OK)
