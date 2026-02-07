from __future__ import annotations

import hashlib
import re
import secrets
from zoneinfo import ZoneInfo
from zoneinfo import ZoneInfoNotFoundError
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.core.exceptions import ValidationError
from django.db import IntegrityError, models, transaction
from django.db.models import F
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify


class Organization(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["slug"])]

    def _generate_unique_slug(self) -> str:
        max_len = Organization._meta.get_field("slug").max_length

        base_raw = (slugify(self.name) or "org").lower()
        base = base_raw[:max_len]

        existing = (
            Organization.objects.filter(slug__startswith=base)
            .exclude(pk=self.pk)
            .values_list("slug", flat=True)
        )

        if base not in existing:
            return base

        # Find the next available suffix for patterns like "base-12".
        suffix_re = re.compile(rf"^{re.escape(base)}-(\\d+)$")
        max_i = 0
        for s in existing:
            m = suffix_re.match(s)
            if not m:
                continue
            try:
                max_i = max(max_i, int(m.group(1)))
            except ValueError:
                continue

        i = max_i
        while True:
            i += 1
            suffix = f"-{i}"
            trimmed = base[: max_len - len(suffix)]
            candidate = f"{trimmed}{suffix}"
            if candidate not in existing:
                return candidate

    def save(self, *args, **kwargs):
        if self.slug:
            self.slug = self.slug.lower()

        # Stable slug: only auto-generate when blank.
        if not self.slug:
            # Retry to handle race conditions if two creates pick the same slug.
            for _ in range(10):
                self.slug = self._generate_unique_slug()
                try:
                    return super().save(*args, **kwargs)
                except IntegrityError:
                    self.slug = ""
            raise

        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    ROLE_LEVEL = {
        Role.VIEWER: 1,
        Role.MEMBER: 2,
        Role.ADMIN: 3,
        Role.OWNER: 4,
    }

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="organization_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "user"], name="unique_user_per_org"),
        ]

    def has_permission(self, required_role: str) -> bool:
        required_level = self.ROLE_LEVEL.get(required_role)
        current_level = self.ROLE_LEVEL.get(self.role)
        if required_level is None or current_level is None:
            return False
        return current_level >= required_level

    def clean(self):
        super().clean()
        if not self.is_active:
            return
        if not self.organization_id:
            return

        # Ensure an organization always has at most one active Owner.
        if self.role == self.Role.OWNER:
            existing_owners = (
                OrganizationMembership.objects.filter(
                    organization_id=self.organization_id,
                    role=self.Role.OWNER,
                    is_active=True,
                )
                .exclude(pk=self.pk)
                .count()
            )
            if existing_owners >= 1:
                raise ValidationError({"role": "Organization must have exactly one owner"})

        active_count = OrganizationMembership.objects.filter(organization=self.organization, is_active=True).exclude(pk=self.pk).count()
        if active_count >= 50:
            raise ValidationError("Organizations are limited to 50 active members")

    def save(self, *args, **kwargs):
        # Enforce the 50-active-member invariant under concurrency.
        # By locking the organization row, concurrent membership writes are serialized.
        with transaction.atomic():
            if self.organization_id:
                Organization.objects.select_for_update().filter(pk=self.organization_id).get()
            self.full_clean()
            return super().save(*args, **kwargs)


class Invitation(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=OrganizationMembership.Role.choices, default=OrganizationMembership.Role.MEMBER)

    token = models.CharField(max_length=255, unique=True, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_invitations")

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    email_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["token"])]

    @staticmethod
    def generate_token(nbytes: int = 48) -> str:
        # Minimum 48 bytes URL-safe.
        if nbytes < 48:
            raise ValueError("Invitation token must use at least 48 bytes of randomness")
        return secrets.token_urlsafe(nbytes)

    def is_valid(self) -> bool:
        if self.accepted_at is not None:
            return False
        return self.expires_at > timezone.now()

    def clean(self):
        super().clean()
        if self.organization_id:
            active_count = OrganizationMembership.objects.filter(organization=self.organization, is_active=True).count()
            if active_count >= 50:
                raise ValidationError("Organizations are limited to 50 active members")

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self.generate_token()
        if not self.expires_at:
            ttl_days = getattr(settings, "INVITATION_DEFAULT_TTL_DAYS", 7)
            try:
                ttl_days_int = int(ttl_days)
            except (TypeError, ValueError):
                ttl_days_int = 7
            if ttl_days_int <= 0:
                ttl_days_int = 7
            self.expires_at = timezone.now() + timedelta(days=ttl_days_int)
        # Also serialize invitation creation/updates against membership writes,
        # since Invitation.clean() checks the same active-member cap.
        with transaction.atomic():
            if self.organization_id:
                Organization.objects.select_for_update().filter(pk=self.organization_id).get()
            self.full_clean()
            return super().save(*args, **kwargs)

    @transaction.atomic
    def accept(self, user) -> OrganizationMembership:
        # Re-fetch with lock to avoid double accept.
        invitation = Invitation.objects.select_for_update().get(pk=self.pk)
        if not invitation.is_valid():
            raise ValidationError("Invitation is expired or already accepted")

        membership = OrganizationMembership(organization=invitation.organization, user=user, role=invitation.role, is_active=True)
        membership.save()

        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["accepted_at"])
        return membership

    def invite_url(self) -> str:
        base = getattr(settings, "FRONTEND_BASE_URL", "") or ""
        base = base.rstrip("/")
        return f"{base}/join/{self.token}" if base else f"/join/{self.token}"

    def send_invitation_email(self) -> None:
        subject = f"You're invited to join {self.organization.name}"
        message = (
            f"You have been invited to join {self.organization.name}.\n\n"
            f"Join link: {self.invite_url()}\n\n"
            f"This invitation expires at: {self.expires_at.isoformat()}\n"
        )
        send_mail(
            subject=subject,
            message=message,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@example.com"),
            recipient_list=[self.email],
            fail_silently=True,
        )
        self.email_sent_at = timezone.now()
        self.save(update_fields=["email_sent_at"])


class APIKey(models.Model):
    class Scope(models.TextChoices):
        READ = "read", "Read"
        WRITE = "write", "Write"
        ADMIN = "admin", "Admin"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="api_keys")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="api_keys")

    key_prefix = models.CharField(max_length=8, db_index=True)
    key_hash = models.CharField(max_length=64, unique=True, db_index=True)

    scope = models.CharField(max_length=10, choices=Scope.choices, default=Scope.READ)
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Lightweight usage stats (best-effort) for operational visibility.
    last_used_at = models.DateTimeField(null=True, blank=True)
    request_count = models.BigIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["key_prefix"]), models.Index(fields=["key_hash"])]

    @staticmethod
    def _hash_key(plaintext_key: str) -> str:
        return hashlib.sha256(plaintext_key.encode("utf-8")).hexdigest()

    @classmethod
    def create_with_plaintext(cls, *, organization: Organization, created_by, scope: str = Scope.READ) -> tuple["APIKey", str]:
        plaintext = secrets.token_urlsafe(48)
        hashed = cls._hash_key(plaintext)
        prefix = plaintext[:8]
        instance = cls.objects.create(
            organization=organization,
            created_by=created_by,
            scope=scope,
            key_prefix=prefix,
            key_hash=hashed,
        )
        return instance, plaintext

    def revoke(self) -> None:
        if self.revoked_at is None:
            self.revoked_at = timezone.now()
            self.save(update_fields=["revoked_at"])

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None

    def record_use(self) -> None:
        APIKey.objects.filter(pk=self.pk).update(
            last_used_at=timezone.now(),
            request_count=F("request_count") + 1,
        )


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    avatar_url = models.URLField(blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    primary_organization = models.ForeignKey(
        Organization,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="primary_for_profiles",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValidationError({"timezone": "Invalid timezone"}) from exc

        if self.primary_organization_id and self.user_id:
            is_member = OrganizationMembership.objects.filter(
                organization_id=self.primary_organization_id,
                user_id=self.user_id,
                is_active=True,
            ).exists()
            if not is_member:
                raise ValidationError({"primary_organization": "User must be an active member of the organization"})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class Project(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["organization", "name"], name="unique_project_name_per_org"),
        ]
        indexes = [models.Index(fields=["organization", "status"])]

    def __str__(self) -> str:
        return f"{self.organization.slug}:{self.name}"
