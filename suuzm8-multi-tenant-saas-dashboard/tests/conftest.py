import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(username="u1", email="u1@example.com", password="pass")


@pytest.fixture
def user2(db):
    User = get_user_model()
    return User.objects.create_user(username="u2", email="u2@example.com", password="pass")
