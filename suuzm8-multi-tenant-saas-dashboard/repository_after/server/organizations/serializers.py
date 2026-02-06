from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from organizations.models import APIKey, Invitation, Organization, OrganizationMembership, Project, UserProfile

User = get_user_model()


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


class OrganizationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]

    def create(self, validated_data):
        request = self.context["request"]
        with transaction.atomic():
            org = Organization.objects.create(**validated_data)
            try:
                OrganizationMembership.objects.create(
                    organization=org,
                    user=request.user,
                    role=OrganizationMembership.Role.OWNER,
                    is_active=True,
                )
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"detail": str(exc)}) from exc

            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            if profile.primary_organization_id is None:
                profile.primary_organization = org
                profile.save(update_fields=["primary_organization"])
        return org


class MembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = OrganizationMembership
        fields = ["id", "organization_slug", "user_id", "role", "is_active", "created_at"]
        read_only_fields = ["id", "organization_slug", "user_id", "created_at"]


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "name", "description", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class InvitationSerializer(serializers.ModelSerializer):
    organization_slug = serializers.CharField(source="organization.slug", read_only=True)

    class Meta:
        model = Invitation
        fields = [
            "id",
            "organization_slug",
            "email",
            "role",
            "token",
            "created_at",
            "expires_at",
            "accepted_at",
            "email_sent_at",
        ]
        read_only_fields = [
            "id",
            "organization_slug",
            "token",
            "created_at",
            "expires_at",
            "accepted_at",
            "email_sent_at",
        ]


class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField()


class APIKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = APIKey
        fields = ["id", "key_prefix", "scope", "revoked_at", "created_at", "last_used_at", "request_count"]
        read_only_fields = ["id", "key_prefix", "revoked_at", "created_at", "last_used_at", "request_count"]


class UserProfileSerializer(serializers.ModelSerializer):
    primary_organization_slug = serializers.SlugField(write_only=True, required=False, allow_null=True)
    primary_organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = UserProfile
        fields = ["avatar_url", "timezone", "primary_organization", "primary_organization_slug", "updated_at"]
        read_only_fields = ["primary_organization", "updated_at"]

    def validate_timezone(self, value: str) -> str:
        if not value:
            return "UTC"
        return value

    def validate(self, attrs):
        slug = attrs.pop("primary_organization_slug", serializers.empty)
        request = self.context.get("request")
        if slug is not serializers.empty:
            if slug is None:
                attrs["primary_organization"] = None
            else:
                org = Organization.objects.filter(slug=slug).first()
                if not org:
                    raise serializers.ValidationError({"primary_organization_slug": "Organization not found"})
                is_member = OrganizationMembership.objects.filter(
                    organization=org,
                    user=request.user,
                    is_active=True,
                ).exists()
                if not is_member:
                    raise serializers.ValidationError({"primary_organization_slug": "User is not an active member"})
                attrs["primary_organization"] = org

        return attrs


class APIKeyCreateSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=APIKey.Scope.choices, default=APIKey.Scope.READ)

    def create(self, validated_data):
        request = self.context["request"]
        organization = self.context["organization"]
        instance, plaintext = APIKey.create_with_plaintext(
            organization=organization,
            created_by=request.user,
            scope=validated_data["scope"],
        )
        self.context["plaintext_key"] = plaintext
        return instance

    def to_representation(self, instance):
        data = APIKeySerializer(instance).data
        plaintext = self.context.get("plaintext_key")
        if plaintext:
            data["key"] = plaintext
        return data
