from __future__ import annotations

import hashlib

from django.utils.translation import gettext_lazy as _
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

from organizations.models import APIKey


class APIKeyAuthentication(authentication.BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        raw = request.headers.get("X-API-Key")
        if not raw:
            auth = request.headers.get("Authorization")
            if auth and auth.startswith(self.keyword + " "):
                raw = auth[len(self.keyword) + 1 :].strip()

        if not raw:
            return None

        key_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        try:
            api_key = APIKey.objects.select_related("organization", "created_by").get(key_hash=key_hash)
        except APIKey.DoesNotExist as exc:
            raise AuthenticationFailed(_("Invalid API key")) from exc

        if not api_key.is_active:
            raise AuthenticationFailed(_("API key revoked"))

        # Treat API key as acting on behalf of creator.
        request.api_key = api_key
        request.organization = api_key.organization
        return (api_key.created_by, api_key)
