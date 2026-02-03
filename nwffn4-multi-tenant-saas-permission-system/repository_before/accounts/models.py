from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    current_organization = models.ForeignKey(
        'Organization', null=True, blank=True, on_delete=models.SET_NULL, related_name='current_users'
    )


class Organization(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Team(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='teams')
    name = models.CharField(max_length=200)
    slug = models.SlugField()

    class Meta:
        unique_together = ['organization', 'slug']

    def __str__(self):
        return f"{self.organization.name} - {self.name}"


class Project(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=200)
    slug = models.SlugField()

    class Meta:
        unique_together = ['team', 'slug']

    def __str__(self):
        return self.name


class Task(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tasks')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class OrganizationMember(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, default='member')

    class Meta:
        unique_together = ['organization', 'user']


class TeamMember(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, default='member')

    class Meta:
        unique_together = ['team', 'user']


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, default='member')

    class Meta:
        unique_together = ['project', 'user']


class CustomRole(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='custom_roles')
    name = models.CharField(max_length=100)
    base_predefined_role = models.CharField(max_length=50)
    permissions = models.ManyToManyField('permissions.Permission', related_name='custom_roles')

    class Meta:
        unique_together = ['organization', 'name']

    def __str__(self):
        return f"{self.organization.name} - {self.name}"


class PermissionOverride(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='permission_overrides')
    resource_type = models.CharField(max_length=50)
    resource_id = models.IntegerField()
    permissions = models.JSONField(default=dict)

    class Meta:
        unique_together = ['user', 'resource_type', 'resource_id']
