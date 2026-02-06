from django.urls import include, path
from rest_framework.routers import DefaultRouter

from organizations.views import (
    APIKeyViewSet,
    InvitationViewSet,
    JoinViewSet,
    MembershipViewSet,
    OrganizationDashboardViewSet,
    OrganizationViewSet,
    ProjectViewSet,
    ProfileViewSet,
    TransferOwnershipViewSet,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organizations")

org_router = DefaultRouter()
org_router.register(r"projects", ProjectViewSet, basename="org-projects")
org_router.register(r"memberships", MembershipViewSet, basename="org-memberships")
org_router.register(r"invitations", InvitationViewSet, basename="org-invitations")
org_router.register(r"api-keys", APIKeyViewSet, basename="org-api-keys")

urlpatterns = [
    path("", include(router.urls)),
    path("profile/", ProfileViewSet.as_view({"get": "retrieve", "patch": "partial_update"}), name="profile"),
    path("organizations/<slug:organization_slug>/", include(org_router.urls)),
    path(
        "organizations/<slug:organization_slug>/dashboard/",
        OrganizationDashboardViewSet.as_view({"get": "dashboard"}),
        name="org-dashboard",
    ),
    path(
        "organizations/<slug:organization_slug>/transfer_ownership/",
        TransferOwnershipViewSet.as_view({"post": "transfer"}),
        name="org-transfer-ownership",
    ),
]

# Explicit join routes (simpler than router for regex token)
urlpatterns += [
    path("join/<str:token>/", JoinViewSet.as_view({"get": "validate"}), name="join-validate"),
    path("join/<str:token>/accept/", JoinViewSet.as_view({"post": "accept"}), name="join-accept"),
]
