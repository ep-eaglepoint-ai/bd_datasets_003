from accounts.models import (
    Team, Project, Task,
    OrganizationMember, TeamMember, ProjectMember
)


ROLE_PERMISSIONS = {
    'owner': ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles'],
    'admin': ['create', 'read', 'update', 'delete', 'manage_members'],
    'member': ['create', 'read', 'update'],
    'viewer': ['read'],
}


class PermissionChecker:

    def check_permission(self, user, resource_type, resource_id, permission):
        if resource_type == 'organization':
            return self._check_organization_permission(user, resource_id, permission)
        elif resource_type == 'team':
            return self._check_team_permission(user, resource_id, permission)
        elif resource_type == 'project':
            return self._check_project_permission(user, resource_id, permission)
        elif resource_type == 'task':
            return self._check_task_permission(user, resource_id, permission)
        return False

    def _check_organization_permission(self, user, org_id, permission):
        try:
            membership = OrganizationMember.objects.get(organization_id=org_id, user=user)
            role_permissions = ROLE_PERMISSIONS.get(membership.role, [])
            return permission in role_permissions
        except OrganizationMember.DoesNotExist:
            return False

    def _check_team_permission(self, user, team_id, permission):
        try:
            team = Team.objects.get(id=team_id)
            membership = TeamMember.objects.get(team_id=team_id, user=user)
            role_permissions = ROLE_PERMISSIONS.get(membership.role, [])
            return permission in role_permissions
        except (Team.DoesNotExist, TeamMember.DoesNotExist):
            return self._check_organization_permission(user, team.organization_id, permission)

    def _check_project_permission(self, user, project_id, permission):
        try:
            project = Project.objects.get(id=project_id)
            membership = ProjectMember.objects.get(project_id=project_id, user=user)
            role_permissions = ROLE_PERMISSIONS.get(membership.role, [])
            return permission in role_permissions
        except (Project.DoesNotExist, ProjectMember.DoesNotExist):
            return self._check_team_permission(user, project.team_id, permission)

    def _check_task_permission(self, user, task_id, permission):
        try:
            task = Task.objects.get(id=task_id)
        except Task.DoesNotExist:
            return False
        return self._check_project_permission(user, task.project_id, permission)


permission_checker = PermissionChecker()
