import re
from pathlib import Path

import pytest
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core import mail
from django.db import IntegrityError
from django.utils import timezone
from django.db import connection
from django.test.utils import CaptureQueriesContext
from freezegun import freeze_time

from organizations.models import APIKey, Invitation, Organization, OrganizationMembership, Project, UserProfile


@pytest.mark.django_db
def test_project_timestamps_are_utc_and_serialized_with_utc_offset(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.MEMBER)

    api_client.force_authenticate(user=user)
    resp = api_client.post(
        f"/api/organizations/{org.slug}/projects/",
        {"name": "P1", "description": "d"},
        format="json",
    )
    assert resp.status_code in (200, 201)

    proj = Project.objects.get(organization=org, name="P1")
    assert timezone.is_aware(proj.created_at) is True
    assert proj.created_at.utcoffset().total_seconds() == 0

    created_at = resp.data.get("created_at")
    assert created_at
    # DRF typically returns ISO with +00:00 when USE_TZ is enabled.
    assert ("+00:00" in created_at) or created_at.endswith("Z")


@pytest.mark.django_db
def test_org_slug_autogenerates_and_handles_duplicates():
    org1 = Organization.objects.create(name="Acme")
    org2 = Organization.objects.create(name="Acme")
    org3 = Organization.objects.create(name="Acme")

    assert org1.slug == "acme"
    assert org2.slug == "acme-1"
    assert org3.slug == "acme-2"

    # indexed slug
    assert Organization._meta.get_field("slug").db_index is True


@pytest.mark.django_db
def test_org_slug_handles_case_and_punctuation_collisions_and_is_stable_on_rename():
    org1 = Organization.objects.create(name="Acme")
    org2 = Organization.objects.create(name="acme!")
    org3 = Organization.objects.create(name="ACME")

    assert org1.slug == "acme"
    assert org2.slug.startswith("acme")
    assert org3.slug.startswith("acme")
    assert len({org1.slug, org2.slug, org3.slug}) == 3

    # Stable slug: renaming should not change slug.
    old = org1.slug
    org1.name = "New Name"
    org1.save(update_fields=["name"])
    org1.refresh_from_db()
    assert org1.slug == old


@pytest.mark.django_db
def test_org_slug_non_ascii_names_fall_back_to_org_and_dedupe():
    org1 = Organization.objects.create(name="東京")
    org2 = Organization.objects.create(name="東京")
    assert org1.slug.startswith("org")
    assert org2.slug.startswith("org")
    assert org1.slug != org2.slug


@pytest.mark.django_db
def test_membership_role_hierarchy_and_uniqueness(user):
    org = Organization.objects.create(name="Org")

    m_owner = OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    assert m_owner.has_permission(OrganizationMembership.Role.OWNER) is True
    assert m_owner.has_permission(OrganizationMembership.Role.ADMIN) is True
    assert m_owner.has_permission(OrganizationMembership.Role.MEMBER) is True
    assert m_owner.has_permission(OrganizationMembership.Role.VIEWER) is True

    m_viewer = OrganizationMembership.objects.create(
        organization=org,
        user=type(user).objects.create_user(username="viewer", password="pass"),
        role=OrganizationMembership.Role.VIEWER,
    )
    assert m_viewer.has_permission(OrganizationMembership.Role.MEMBER) is False
    assert m_viewer.has_permission("not-a-role") is False

    with pytest.raises((IntegrityError, ValidationError)):
        OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.ADMIN)


@pytest.mark.django_db
def test_org_hard_limit_50_active_members_enforced_in_save(user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    User = type(user)
    for i in range(49):
        u = User.objects.create_user(username=f"member_{i}", password="pass")
        OrganizationMembership.objects.create(organization=org, user=u, role=OrganizationMembership.Role.MEMBER)

    assert OrganizationMembership.objects.filter(organization=org, is_active=True).count() == 50

    u51 = User.objects.create_user(username="u51", password="pass")
    with pytest.raises(ValidationError):
        OrganizationMembership.objects.create(organization=org, user=u51, role=OrganizationMembership.Role.MEMBER)


@pytest.mark.django_db
def test_invitation_token_expiry_and_accept_atomic(user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    inv = Invitation.objects.create(organization=org, email="new@example.com", created_by=user)
    assert inv.token
    assert len(inv.token) >= 64
    assert inv.is_valid() is True

    inv.expires_at = timezone.now() - timezone.timedelta(days=1)
    inv.save(update_fields=["expires_at"])
    assert inv.is_valid() is False

    inv2 = Invitation.objects.create(organization=org, email="new2@example.com", created_by=user)
    new_user = type(user).objects.create_user(username="new", password="pass")
    membership = inv2.accept(new_user)
    assert membership.organization_id == org.id
    assert membership.user_id == new_user.id

    inv2.refresh_from_db()
    assert inv2.accepted_at is not None
    assert inv2.is_valid() is False

    # Atomic behavior: if membership creation fails, invitation must not be marked accepted.
    inv3 = Invitation.objects.create(organization=org, email="full@example.com", created_by=user)

    # Fill to exactly 50 active members.
    User = type(user)
    current = OrganizationMembership.objects.filter(organization=org, is_active=True).count()
    to_add = 50 - current
    for i in range(to_add):
        u = User.objects.create_user(username=f"full_{i}", password="pass")
        OrganizationMembership.objects.create(organization=org, user=u, role=OrganizationMembership.Role.MEMBER)

    assert OrganizationMembership.objects.filter(organization=org, is_active=True).count() == 50

    u_fail = User.objects.create_user(username="fail", password="pass")
    with pytest.raises(ValidationError):
        inv3.accept(u_fail)
    inv3.refresh_from_db()
    assert inv3.accepted_at is None


@pytest.mark.django_db
def test_invitation_creation_fails_when_org_already_has_50_active_members(user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    User = type(user)
    for i in range(49):
        u = User.objects.create_user(username=f"m_{i}", password="pass")
        OrganizationMembership.objects.create(organization=org, user=u, role=OrganizationMembership.Role.MEMBER)

    assert OrganizationMembership.objects.filter(organization=org, is_active=True).count() == 50
    with pytest.raises(ValidationError):
        Invitation.objects.create(organization=org, email="too-many@example.com", created_by=user)


@pytest.mark.django_db
def test_invitation_default_expiration_is_configurable(settings, user):
    settings.INVITATION_DEFAULT_TTL_DAYS = 3
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    with freeze_time("2026-02-01 12:00:00"):
        inv = Invitation.objects.create(organization=org, email="cfg@example.com", created_by=user)
        assert inv.expires_at == timezone.now() + timezone.timedelta(days=3)


def test_invitation_token_generation_enforces_minimum_bytes():
    with pytest.raises(ValueError):
        Invitation.generate_token(1)


@pytest.mark.django_db
def test_api_keys_hashed_and_plaintext_returned_once(user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    api_key, plaintext = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.READ)

    assert api_key.key_prefix == plaintext[:8]
    assert re.fullmatch(r"[0-9a-f]{64}", api_key.key_hash)
    assert plaintext != api_key.key_hash

    # Plaintext not stored on the model
    assert not hasattr(api_key, "key")


@pytest.mark.django_db
def test_api_key_hash_is_not_plaintext_in_db(user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    api_key, plaintext = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.READ)

    with connection.cursor() as cur:
        cur.execute("SELECT key_hash, key_prefix FROM organizations_apikey WHERE id = %s", [api_key.id])
        row = cur.fetchone()

    assert row is not None
    key_hash, key_prefix = row
    assert key_prefix == plaintext[:8]
    assert re.fullmatch(r"[0-9a-f]{64}", str(key_hash))
    assert str(key_hash) != plaintext


@pytest.mark.django_db
def test_viewer_cannot_create_project_but_member_can(api_client, user, user2):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    OrganizationMembership.objects.create(organization=org, user=user2, role=OrganizationMembership.Role.VIEWER)

    api_client.force_authenticate(user=user2)
    url = f"/api/organizations/{org.slug}/projects/"
    resp = api_client.post(url, {"name": "P1", "description": "d"}, format="json")
    assert resp.status_code == 403

    OrganizationMembership.objects.filter(organization=org, user=user2).update(role=OrganizationMembership.Role.MEMBER)
    resp2 = api_client.post(url, {"name": "P1", "description": "d"}, format="json")
    assert resp2.status_code in (200, 201)


@pytest.mark.django_db
def test_org_scoped_queryset_prevents_cross_tenant_access(api_client, user):
    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")

    OrganizationMembership.objects.create(organization=org_a, user=user, role=OrganizationMembership.Role.MEMBER)

    proj_b = Project.objects.create(organization=org_b, name="Same", description="b")

    api_client.force_authenticate(user=user)
    # Even guessing Org B project id under Org A slug should not reveal it.
    resp = api_client.get(f"/api/organizations/{org_a.slug}/projects/{proj_b.id}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_org_scoped_queryset_prevents_cross_tenant_access_for_memberships_and_invitations_and_api_keys(api_client, user):
    org_a = Organization.objects.create(name="Org A")
    org_b = Organization.objects.create(name="Org B")

    # User is admin in Org A (can list invites/api keys there)
    OrganizationMembership.objects.create(organization=org_a, user=user, role=OrganizationMembership.Role.ADMIN)

    # Create some Org B resources
    outsider = type(user).objects.create_user(username="outsider_b", password="pass")
    m_b = OrganizationMembership.objects.create(organization=org_b, user=outsider, role=OrganizationMembership.Role.MEMBER)
    inv_b = Invitation.objects.create(organization=org_b, email="b@example.com", created_by=outsider)
    api_b, _plaintext = APIKey.create_with_plaintext(organization=org_b, created_by=outsider)

    api_client.force_authenticate(user=user)

    # Membership retrieve by guessed ID under Org A should 404
    resp_m = api_client.get(f"/api/organizations/{org_a.slug}/memberships/{m_b.id}/")
    assert resp_m.status_code == 404

    # Invitation retrieve by guessed ID under Org A should 404
    resp_i = api_client.get(f"/api/organizations/{org_a.slug}/invitations/{inv_b.id}/")
    assert resp_i.status_code == 404

    # API keys are list/create only; ensure Org A list doesn't show Org B key
    resp_k = api_client.get(f"/api/organizations/{org_a.slug}/api-keys/")
    assert resp_k.status_code == 200
    prefixes = [row["key_prefix"] for row in resp_k.data]
    assert api_b.key_prefix not in prefixes


@pytest.mark.django_db
def test_dashboard_cached_and_low_query_count(api_client, django_assert_num_queries, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.MEMBER)

    for i in range(30):
        Project.objects.create(organization=org, name=f"P{i}")

    api_client.force_authenticate(user=user)
    cache.clear()

    with CaptureQueriesContext(connection) as ctx:
        resp = api_client.get(f"/api/organizations/{org.slug}/dashboard/")
    assert len(ctx.captured_queries) < 5
    assert resp.status_code == 200
    assert resp.data["total_projects"] == 30

    # Second request should hit cache for metrics.
    resp2 = api_client.get(f"/api/organizations/{org.slug}/dashboard/")
    assert resp2.status_code == 200


@pytest.mark.django_db
def test_memberships_list_does_not_have_n_plus_one_queries(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.ADMIN)

    User = type(user)
    for i in range(25):
        u = User.objects.create_user(username=f"u_{i}", password="pass")
        OrganizationMembership.objects.create(organization=org, user=u, role=OrganizationMembership.Role.MEMBER)

    api_client.force_authenticate(user=user)

    with CaptureQueriesContext(connection) as ctx:
        resp = api_client.get(f"/api/organizations/{org.slug}/memberships/")
    assert resp.status_code == 200

    # Should stay constant with member count (select_related('user') in queryset).
    assert len(ctx.captured_queries) <= 5


@pytest.mark.django_db
def test_organization_create_auto_creates_owner_membership(api_client, user):
    api_client.force_authenticate(user=user)
    resp = api_client.post("/api/organizations/", {"name": "Created"}, format="json")
    assert resp.status_code in (200, 201)

    org = Organization.objects.get(slug=resp.data["slug"])
    membership = OrganizationMembership.objects.get(organization=org, user=user)
    assert membership.role == OrganizationMembership.Role.OWNER

    profile = UserProfile.objects.get(user=user)
    assert profile.primary_organization_id == org.id


@pytest.mark.django_db
def test_invitation_create_sends_email(api_client, settings, user):
    settings.FRONTEND_BASE_URL = "https://app.example.com"
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.ADMIN)

    api_client.force_authenticate(user=user)
    mail.outbox.clear()

    resp = api_client.post(
        f"/api/organizations/{org.slug}/invitations/",
        {"email": "invitee@example.com", "role": OrganizationMembership.Role.MEMBER},
        format="json",
    )
    assert resp.status_code in (200, 201)
    assert len(mail.outbox) == 1
    assert "invitee@example.com" in mail.outbox[0].to
    assert "/join/" in mail.outbox[0].body


@pytest.mark.django_db
def test_api_key_usage_stats_increment_on_authenticated_requests(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    api_key, plaintext = APIKey.create_with_plaintext(organization=org, created_by=user)

    cache.clear()
    url = f"/api/organizations/{org.slug}/dashboard/"
    resp = api_client.get(url, HTTP_X_API_KEY=plaintext)
    assert resp.status_code == 200
    resp2 = api_client.get(url, HTTP_X_API_KEY=plaintext)
    assert resp2.status_code == 200

    api_key.refresh_from_db()
    assert api_key.request_count >= 2
    assert api_key.last_used_at is not None


@pytest.mark.django_db
def test_organization_create_is_atomic_and_does_not_leave_orphan_memberships(api_client, user, monkeypatch):
    api_client.force_authenticate(user=user)

    # Force membership creation to fail after org creation.
    def boom(*args, **kwargs):
        raise ValidationError("boom")

    monkeypatch.setattr(OrganizationMembership.objects, "create", boom)

    before_orgs = Organization.objects.count()
    before_memberships = OrganizationMembership.objects.count()

    resp = api_client.post("/api/organizations/", {"name": "Will Fail"}, format="json")
    assert resp.status_code == 400

    assert Organization.objects.count() == before_orgs
    assert OrganizationMembership.objects.count() == before_memberships


@pytest.mark.django_db
def test_transfer_ownership_edge_cases(api_client, user, user2):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    OrganizationMembership.objects.create(organization=org, user=user2, role=OrganizationMembership.Role.MEMBER)

    # Non-owner forbidden
    api_client.force_authenticate(user=user2)
    resp = api_client.post(f"/api/organizations/{org.slug}/transfer_ownership/", {"user_id": user2.id}, format="json")
    assert resp.status_code == 403

    # Owner cannot transfer to non-member
    api_client.force_authenticate(user=user)
    outsider = type(user).objects.create_user(username="outsider", password="pass")
    resp2 = api_client.post(f"/api/organizations/{org.slug}/transfer_ownership/", {"user_id": outsider.id}, format="json")
    assert resp2.status_code == 400

    # Happy path transfer
    resp3 = api_client.post(f"/api/organizations/{org.slug}/transfer_ownership/", {"user_id": user2.id}, format="json")
    assert resp3.status_code == 200

    owners = OrganizationMembership.objects.filter(organization=org, role=OrganizationMembership.Role.OWNER, is_active=True)
    assert owners.count() == 1
    assert owners.first().user_id == user2.id

    prev = OrganizationMembership.objects.get(organization=org, user=user)
    assert prev.role == OrganizationMembership.Role.ADMIN


@pytest.mark.django_db
def test_admin_cannot_assign_owner_role_via_membership_update(api_client, user, user2):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    OrganizationMembership.objects.create(organization=org, user=user2, role=OrganizationMembership.Role.ADMIN)

    member = type(user).objects.create_user(username="member", password="pass")
    membership = OrganizationMembership.objects.create(
        organization=org,
        user=member,
        role=OrganizationMembership.Role.MEMBER,
    )

    api_client.force_authenticate(user=user2)
    resp = api_client.patch(
        f"/api/organizations/{org.slug}/memberships/{membership.id}/",
        {"role": OrganizationMembership.Role.OWNER},
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_owner_membership_cannot_be_deleted_via_memberships_endpoint(api_client, user, user2):
    org = Organization.objects.create(name="Org")
    owner_membership = OrganizationMembership.objects.create(
        organization=org,
        user=user,
        role=OrganizationMembership.Role.OWNER,
    )
    OrganizationMembership.objects.create(organization=org, user=user2, role=OrganizationMembership.Role.ADMIN)

    api_client.force_authenticate(user=user2)
    resp = api_client.delete(f"/api/organizations/{org.slug}/memberships/{owner_membership.id}/")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_api_key_rate_limit_1000_per_hour_returns_429_with_retry_after(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    api_key, plaintext = APIKey.create_with_plaintext(organization=org, created_by=user)

    # Ensure the user is a member for permission checks.
    OrganizationMembership.objects.filter(organization=org, user=user).update(role=OrganizationMembership.Role.MEMBER)

    cache.clear()

    url = f"/api/organizations/{org.slug}/dashboard/"
    for i in range(1000):
        resp = api_client.get(url, HTTP_X_API_KEY=plaintext)
        assert resp.status_code == 200

    resp_last = api_client.get(url, HTTP_X_API_KEY=plaintext)
    assert resp_last.status_code == 429
    retry_after = resp_last.headers.get("Retry-After")
    assert retry_after is not None
    retry_after_int = int(retry_after)
    assert 1 <= retry_after_int <= 3600


@pytest.mark.django_db
def test_organization_delete_requires_admin_or_owner(api_client, user, user2):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.ADMIN)
    OrganizationMembership.objects.create(organization=org, user=user2, role=OrganizationMembership.Role.OWNER)

    api_client.force_authenticate(user=user)
    resp = api_client.delete(f"/api/organizations/{org.slug}/")
    assert resp.status_code == 403
    assert Organization.objects.filter(id=org.id).exists() is True

    api_client.force_authenticate(user=user2)
    resp2 = api_client.delete(f"/api/organizations/{org.slug}/")
    assert resp2.status_code in (200, 204)
    assert Organization.objects.filter(id=org.id).exists() is False


@pytest.mark.django_db
def test_api_key_revoke_endpoint_revokes_and_blocks_future_auth(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    api_key, plaintext = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.ADMIN)

    api_client.force_authenticate(user=user)
    resp = api_client.post(f"/api/organizations/{org.slug}/api-keys/{api_key.id}/revoke/")
    assert resp.status_code == 204

    api_key.refresh_from_db()
    assert api_key.revoked_at is not None

    # Clear user auth so the API key must be used.
    api_client.force_authenticate(user=None)
    resp2 = api_client.get(f"/api/organizations/{org.slug}/dashboard/", HTTP_X_API_KEY=plaintext)
    assert resp2.status_code in (401, 403)


@pytest.mark.django_db
def test_api_key_scopes_enforced_read_cannot_write_but_write_can(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    read_key, read_plain = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.READ)
    write_key, write_plain = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.WRITE)
    assert read_key.is_active is True
    assert write_key.is_active is True

    url = f"/api/organizations/{org.slug}/projects/"
    resp = api_client.post(url, {"name": "P1", "description": "d"}, format="json", HTTP_X_API_KEY=read_plain)
    assert resp.status_code == 403

    resp2 = api_client.post(url, {"name": "P2", "description": "d"}, format="json", HTTP_X_API_KEY=write_plain)
    assert resp2.status_code in (200, 201)


@pytest.mark.django_db
def test_api_key_write_scope_cannot_access_admin_endpoints_but_admin_can(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)

    _k1, write_plain = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.WRITE)
    _k2, admin_plain = APIKey.create_with_plaintext(organization=org, created_by=user, scope=APIKey.Scope.ADMIN)

    url = f"/api/organizations/{org.slug}/invitations/"
    payload = {"email": "invitee@example.com", "role": OrganizationMembership.Role.MEMBER}

    resp = api_client.post(url, payload, format="json", HTTP_X_API_KEY=write_plain)
    assert resp.status_code == 403

    resp2 = api_client.post(url, payload, format="json", HTTP_X_API_KEY=admin_plain)
    assert resp2.status_code in (200, 201)


@pytest.mark.django_db
def test_join_validate_is_public(api_client, user):
    org = Organization.objects.create(name="Org")
    OrganizationMembership.objects.create(organization=org, user=user, role=OrganizationMembership.Role.OWNER)
    inv = Invitation.objects.create(organization=org, email="new@example.com", created_by=user)

    api_client.force_authenticate(user=None)
    resp = api_client.get(f"/api/join/{inv.token}/")
    assert resp.status_code == 200


def test_no_raw_sql_usage_in_organizations_app():
    base = Path(__file__).resolve().parents[1] / "repository_after" / "server" / "organizations"
    patterns = [
        r"\.raw\(",
        r"connection\.cursor\(",
        r"\.extra\(",
        r"\.execute\(",
    ]
    rx = re.compile("|".join(patterns))

    for path in base.rglob("*.py"):
        if "migrations" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        assert rx.search(text) is None, f"Raw SQL-like usage found in {path}"
