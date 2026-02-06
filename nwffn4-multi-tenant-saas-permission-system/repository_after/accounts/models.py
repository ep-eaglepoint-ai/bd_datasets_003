from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError


class User(AbstractUser):
    current_organization = models.ForeignKey(
        'Organization', null=True, blank=True, on_delete=models.SET_NULL, related_name='current_users'
    )

    def switch_organization(self, organization):
        if not OrganizationMember.objects.filter(user=self, organization=organization).exists():
            raise PermissionError("User is not a member of this organization")
        self.current_organization = organization
        self.save(update_fields=['current_organization'])


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
    custom_role = models.ForeignKey('CustomRole', on_delete=models.SET_NULL, null=True, blank=True, related_name='org_members')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['organization', 'user']
        indexes = [
            models.Index(fields=['user', 'organization']),
            models.Index(fields=['organization', 'role']),
        ]

    def get_permissions(self):
        # Import here to avoid circular dependency
        # TODO: Consider moving PREDEFINED_ROLES to a constants module
        from permissions.services.permission_checker import PREDEFINED_ROLES
        if self.custom_role:
            return self.custom_role.permissions
        return PREDEFINED_ROLES.get(self.role, [])


class TeamMember(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, default='member')
    custom_role = models.ForeignKey('CustomRole', on_delete=models.SET_NULL, null=True, blank=True, related_name='team_members')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['team', 'user']
        indexes = [
            models.Index(fields=['user', 'team']),
            models.Index(fields=['team', 'role']),
        ]

    def get_permissions(self):
        # Import here to avoid circular dependency
        # TODO: Consider moving PREDEFINED_ROLES to a constants module
        from permissions.services.permission_checker import PREDEFINED_ROLES
        if self.custom_role:
            return self.custom_role.permissions
        return PREDEFINED_ROLES.get(self.role, [])


class ProjectMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=50, default='member')
    custom_role = models.ForeignKey('CustomRole', on_delete=models.SET_NULL, null=True, blank=True, related_name='project_members')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['project', 'user']
        indexes = [
            models.Index(fields=['user', 'project']),
            models.Index(fields=['project', 'role']),
        ]

    def get_permissions(self):
        # Import here to avoid circular dependency
        # TODO: Consider moving PREDEFINED_ROLES to a constants module
        from permissions.services.permission_checker import PREDEFINED_ROLES
        if self.custom_role:
            return self.custom_role.permissions
        return PREDEFINED_ROLES.get(self.role, [])


class CustomRole(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='custom_roles')
    name = models.CharField(max_length=100)
    base_role = models.CharField(max_length=50, choices=[
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('member', 'Member'),
        ('viewer', 'Viewer')
    ])
    permissions = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['organization', 'name']
        indexes = [
            models.Index(fields=['organization', 'base_role']),
        ]

    def __str__(self):
        return f"{self.organization.name} - {self.name}"

    def clean(self):
        from permissions.services.permission_checker import PREDEFINED_ROLES
        base_permissions = set(PREDEFINED_ROLES.get(self.base_role, []))
        custom_permissions = set(self.permissions)
        
        if not custom_permissions.issubset(base_permissions):
            excess = custom_permissions - base_permissions
            raise ValidationError(
                f"Permissions {excess} exceed base role '{self.base_role}' permissions"
            )

    def save(self, *args, **kwargs):
        """
        Ensure that model validation (including the permissions subset check in
        clean()) is run whenever this instance is saved via the ORM.
        
        Note:
            Django does not call save() or full_clean() for bulk operations such
            as bulk_create(), bulk_update(), or queryset.update(). As a result,
            the constraint that `permissions` must be a subset of the base role's
            permissions is NOT enforced for those operations.
            
            When creating or updating CustomRole instances in bulk, callers must
            either:
              * avoid using bulk_* / update() and instead save each instance
                individually (so this method is invoked), or
              * explicitly call full_clean() on each instance before performing
                the bulk write.
        """
        self.full_clean()
        super().save(*args, **kwargs)


class PermissionOverride(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='permission_overrides')
    resource_type = models.CharField(max_length=50)
    resource_id = models.IntegerField()
    permission = models.CharField(max_length=50, choices=[
        ('create', 'Create'),
        ('read', 'Read'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('manage_members', 'Manage Members'),
        ('manage_roles', 'Manage Roles')
    ])
    is_granted = models.BooleanField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['user', 'resource_type', 'resource_id', 'permission']
        indexes = [
            models.Index(fields=['user', 'resource_type', 'resource_id']),
            models.Index(fields=['resource_type', 'resource_id']),
        ]
